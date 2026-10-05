import { withMobileDeadline } from "./mobileResilience";

export type ModuleState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "unavailable"; data: null; error: unknown };
export type Readers = Record<string, () => Promise<unknown>>;
export type ProgressiveState<R extends Readers> = {
  authority: ModuleState<unknown>;
  modules: { [K in keyof R]: ModuleState<Awaited<ReturnType<R[K]>>> };
};
const loading = () => ({ status: "loading" as const, data: null, error: null });

// Rendering subscribes to each result, never to a Promise.all barrier. A retry
// checks live authority again; the pending map prevents overlapping duplicate reads.
export function createArtisanProgressive<R extends Readers>(
  authority: () => Promise<unknown>,
  readers: R,
  changed: (state: ProgressiveState<R>) => void,
  deadline = 30000,
) {
  let state = {
    authority: loading(),
    modules: Object.fromEntries(
      Object.keys(readers).map((k) => [k, loading()]),
    ),
  } as ProgressiveState<R>;
  let active = true;
  const pending = new Map<string, Promise<void>>();
  let gate: Promise<unknown> | null = null;
  const emit = () => {
    if (active) changed({ ...state, modules: { ...state.modules } });
  };
  const access = (preserveReady = false) => {
    if (!gate) {
      if (!preserveReady || state.authority.status !== "ready")
        state.authority = loading();
      gate = withMobileDeadline(authority(), deadline)
        .then(
          (data) => {
            state.authority = { status: "ready", data, error: null };
            emit();
            return data;
          },
          (error) => {
            state.authority = { status: "unavailable", data: null, error };
            // No private snapshot survives a failed canonical authority check.
            for (const k of Object.keys(readers))
              state.modules[k as keyof R] = {
                status: "unavailable",
                data: null,
                error,
              };
            emit();
            throw error;
          },
        )
        .finally(() => {
          gate = null;
        });
      emit();
    }
    return gate;
  };
  function run(key: keyof R, check: Promise<unknown>) {
    if (pending.has(String(key))) return pending.get(String(key))!;
    state.modules[key] = loading();
    emit();
    // Readers with table access share the in-flight canonical access request;
    // mission/offers RPCs enforce the same guard on the server themselves.
    const read = withMobileDeadline(
      Promise.resolve().then(readers[key]),
      deadline,
    );
    const task = Promise.all([check, read])
      .then(
        ([, data]) => {
          if (state.authority.status === "ready")
            state.modules[key] = {
              status: "ready",
              data,
              error: null,
            } as ProgressiveState<R>["modules"][keyof R];
        },
        (error) => {
          state.modules[key] = { status: "unavailable", data: null, error };
        },
      )
      .finally(() => {
        pending.delete(String(key));
        emit();
      });
    pending.set(String(key), task);
    return task;
  }
  return {
    get state() {
      return state;
    },
    refresh() {
      if (pending.size) return Promise.all([...pending.values()]);
      const check = access();
      return Promise.all(Object.keys(readers).map((k) => run(k, check)));
    },
    retry(key: keyof R) {
      if (pending.has(String(key))) return pending.get(String(key))!;
      return run(key, access(true));
    },
    resume() {
      active = true;
      emit();
    },
    pause() {
      active = false;
    },
  };
}

// Share only overlapping reads across Home/RAFI navigation; never retain a result
// as an authorization cache or start a polling loop.
export function inFlightRead<T>(
  read: () => Promise<T>,
  scope: () => Promise<string> = async () => "local",
): () => Promise<T> {
  const pending = new Map<string, Promise<T>>();
  return async () => {
    const key = await scope();
    if (!pending.has(key))
      pending.set(
        key,
        Promise.resolve()
          .then(read)
          .finally(() => {
            pending.delete(key);
          }),
      );
    return pending.get(key)!;
  };
}
