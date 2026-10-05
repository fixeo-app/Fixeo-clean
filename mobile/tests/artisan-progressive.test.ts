import assert from "node:assert/strict";
import test from "node:test";
import {
  createArtisanProgressive,
  inFlightRead,
} from "../lib/artisanProgressive";
const deferred = <T>() => {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise<void>((r) => setImmediate(r));

test("Home publishes canonical authority and mission while finances are still pending; no duplicate reads", async () => {
  const authority = deferred<string>(),
    mission = deferred<string>(),
    ledger = deferred<number>();
  const calls = { authority: 0, mission: 0, ledger: 0 };
  const c = createArtisanProgressive(
    () => {
      calls.authority++;
      return authority.promise;
    },
    {
      mission: () => {
        calls.mission++;
        return mission.promise;
      },
      ledger: () => {
        calls.ledger++;
        return ledger.promise;
      },
    },
    () => {},
  );
  const done = c.refresh();
  c.refresh();
  c.retry("ledger");
  await tick();
  assert.deepEqual(calls, { authority: 1, mission: 1, ledger: 1 });
  mission.resolve("real mission");
  await tick();
  assert.equal(
    c.state.modules.mission.status,
    "loading",
    "private result waits for authority",
  );
  authority.resolve("canonical artisan");
  await tick();
  assert.equal(c.state.authority.status, "ready");
  assert.equal(c.state.modules.mission.data, "real mission");
  assert.equal(c.state.modules.ledger.status, "loading");
  ledger.resolve(200);
  await done;
  assert.equal(c.state.modules.ledger.data, 200);
});
test("One unavailable module does not block other modules; retry checks authority and only retries that module", async () => {
  let checks = 0,
    missions = 0,
    finances = 0;
  const c = createArtisanProgressive(
    async () => {
      checks++;
      return "artisan";
    },
    {
      mission: async () => {
        missions++;
        return "mission";
      },
      ledger: async () => {
        if (++finances === 1) throw Error("offline");
        return 200;
      },
    },
    () => {},
  );
  await c.refresh();
  assert.equal(c.state.modules.mission.status, "ready");
  assert.equal(c.state.modules.ledger.status, "unavailable");
  await c.retry("ledger");
  assert.deepEqual([checks, missions, finances], [2, 1, 2]);
  assert.equal(c.state.modules.ledger.data, 200);
});
test("Denied or revoked authority hides every private result including previously ready modules", async () => {
  let revoked = false;
  const c = createArtisanProgressive(
    async () => {
      if (revoked) throw Error("SESSION_REVOKED");
      return "artisan";
    },
    { mission: async () => "private mission", ledger: async () => 200 },
    () => {},
  );
  await c.refresh();
  revoked = true;
  await c.retry("ledger");
  assert.equal(c.state.authority.status, "unavailable");
  for (const state of Object.values(c.state.modules)) {
    assert.equal(state.data, null);
    assert.equal(state.status, "unavailable");
  }
});
test("Per-module deadline is a last resort; late responses do not overwrite an explicit retry", async () => {
  const slow = deferred<number>();
  let tries = 0;
  const c = createArtisanProgressive(
    async () => true,
    {
      mission: async () => "ready now",
      ledger: () => (++tries === 1 ? slow.promise : Promise.resolve(250)),
    },
    () => {},
    15,
  );
  await c.refresh();
  assert.equal(c.state.modules.mission.data, "ready now");
  assert.equal(c.state.modules.ledger.status, "unavailable");
  await c.retry("ledger");
  slow.resolve(999);
  await tick();
  assert.equal(c.state.modules.ledger.data, 250);
});

test("Overlapping Home and RAFI reads share the request, but a later visit fetches afresh", async () => {
  let calls = 0;
  const response = deferred<string>();
  const read = inFlightRead(() => {
    calls++;
    return response.promise;
  });
  const first = read(),
    second = read();
  await tick();
  assert.equal(calls, 1);

  response.resolve("server value");
  await first;
  await read();
  assert.equal(calls, 2);
});

test("In-flight reads cannot cross an Auth session boundary", async () => {
  let scope = "session A",
    calls = 0;
  const a = deferred<string>(),
    b = deferred<string>();
  const read = inFlightRead(
    () => (++calls === 1 ? a.promise : b.promise),
    async () => scope,
  );
  const first = read();
  await tick();
  scope = "session B";
  const second = read();
  await tick();
  assert.equal(calls, 2);
  b.resolve("B result");
  a.resolve("A result");
  assert.equal(await first, "A result");
  assert.equal(await second, "B result");
});
