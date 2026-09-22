'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateSafety, MESSAGES } = require('../../api/diagnostic/safety');
const { analyze } = require('../../api/diagnostic/engine');
const { photoObservations } = require('../../api/diagnostic/photo-grounding');
const { hash } = require('../../api/diagnostic/auth');
const { createHandler } = require('../../api/diagnostic');
const { config } = require('../../api/diagnostic/config');
const { beforeAction } = require('../../api/diagnostic/estimator-bridge');

const warning =
  'Ne touchez pas à l’installation et coupez l’alimentation si cela peut être fait sans risque.';
const sample = (extra = {}) => ({
  trade: 'electricite',
  problem: 'Équipement électrique détérioré à vérifier.',
  observations: [],
  hypotheses: ['Protection mécanique détériorée'],
  urgency: 'moderate',
  urgency_reason: 'Contrôle professionnel nécessaire.',
  checks: [],
  possible_parts: [],
  question_ids: [],
  safety_signals: [],
  ...extra,
});
const input = (description) => ({
  description,
  answers: {},
  safety_signals: [],
});
const run = (description, model = sample(), previous_safety_signals = []) =>
  analyze(
    { input: input(description), media: [], previous_safety_signals },
    {
      provider: { analyze: async () => ({ result: model, usage: {} }) },
      mediaStore: {},
    },
  );

test('broken electrical equipment alone warns and routes urgently to an electrician without certifying safety', async () => {
  for (const description of [
    'Une prise cassée.',
    'Un interrupteur cassé.',
    'Un câble apparent.',
    'Un fil dénudé.',
    'Des fils exposés.',
    'Une prise avec un cache manquant.',
    'Cache manquant sur un interrupteur.',
    'Équipement électrique détérioré.',
    'Installation électrique endommagée.',
    'Broken socket.',
    'Exposed wiring.',
    'Prise cassée, aucune fumée. Pas d’étincelle. Sans danger immédiat.',
  ]) {
    // The deterministic routing remains high even if the synthesis underestimates urgency/trade.
    const { result, providerCalled } = await run(
      description,
      sample({ trade: 'autre', urgency: 'low' }),
    );
    assert.equal(providerCalled, true, description);
    assert.equal(result.safety.stop, false, description);
    assert.equal(result.safety.safety_cleared, false, description);
    assert.deepEqual(result.safety.signals, ['electrical_risk'], description);
    assert.deepEqual(result.safety.messages, [warning]);
    assert.equal(result.trade.value, 'electricite');
    assert.equal(result.urgency.value, 'high');
    assert.equal(result.safety.urgency, 'urgent');
    assert.equal(result.next, 'qualification');
    assert.match(result.checks[0], /électricien/);
  }
});

test('critical electrical and fire signs stop before any media download or AI call', async () => {
  for (const description of [
    'Une prise cassée avec des flammes.',
    'Une fumée importante sort de la prise.',
    'Des étincelles actives.',
    'Odeur forte de brûlé.',
    'Une électrocution.',
    'Une électrisation.',
    'Un fil sous tension.',
    'Un câble sous tension apparent.',
    'De l’eau en contact avec l’installation électrique.',
    'L’eau coule sur la prise.',
    'Une prise mouillée.',
    'Water in contact with an electrical socket.',
    'Danger immédiat explicite.',
    'Active sparks.',
    'Electric shock.',
  ]) {
    const out = await analyze(
      { input: input(description), media: [{ path: 'never-read' }] },
      {
        provider: {
          analyze() {
            assert.fail('Critical cases must stop before AI');
          },
        },
        mediaStore: {
          download() {
            assert.fail('Critical cases must stop before media');
          },
        },
      },
    );
    assert.equal(out.providerCalled, false, description);
    assert.equal(out.result.next, 'safety_stop', description);
    assert.equal(out.result.safety.stop, true, description);
    assert.equal(out.result.urgency.value, 'critical');
  }
});

test('technical risk cannot clear confirmed, previous, model or uncertain critical signals', () => {
  for (const critical of [
    'electricity',
    'fire',
    'gas',
    'major_leak',
    'flood',
    'structure',
    'immediate_danger',
  ]) {
    for (const result of [
      evaluateSafety({
        ...input('Prise cassée. Aucune fumée.'),
        safety_signals: [critical],
      }),
      evaluateSafety(input('Prise cassée. Aucune fumée.'), null, [critical]),
      evaluateSafety(
        input('Prise cassée. Aucune fumée.'),
        sample({ safety_signals: [critical] }),
      ),
    ]) {
      assert.equal(result.stop, true, critical);
      assert.equal(result.urgency, 'now');
      assert.ok(result.messages.includes(MESSAGES[critical]));
    }
  }
  for (const result of [
    evaluateSafety({
      ...input('Interrupteur cassé.'),
      answers: { smoke_sparks: 'yes' },
    }),
    evaluateSafety(input('Prise cassée. Pas de fumée ?')),
    evaluateSafety(input('Prise cassée. Aucune fumée, sauf près du câble.')),
    evaluateSafety(
      input('Prise cassée.'),
      sample({ urgency: 'critical', safety_signals: ['electrical_risk'] }),
    ),
    evaluateSafety(
      input('Prise cassée. Pas de fumée ici, mais de la fumée ailleurs.'),
    ),
  ])
    assert.equal(result.stop, true);
});

test('explicit negations do not invent technical risk or clear another positive mention', () => {
  for (const description of [
    'Pas de fil dénudé.',
    'Aucun câble apparent.',
    'Pas de prise cassée.',
    'Aucun interrupteur endommagé.',
  ]) {
    const result = evaluateSafety(input(description));
    assert.deepEqual(result.signals, [], description);
    assert.equal(result.safety_cleared, false);
  }
  assert.deepEqual(
    evaluateSafety(
      input('Pas de prise cassée ici. Un interrupteur cassé ailleurs.'),
    ).signals,
    ['electrical_risk'],
  );
  assert.equal(
    evaluateSafety(input('Une panne de connexion internet.')).urgency,
    'normale',
  );
});

test('photo-only electrical risk is retained independently of synthesis; any photo critical sign wins', async () => {
  const id = 'dc986e10-b315-4000-8000-2d458b457704',
    bytes = Buffer.from('photo fixture');
  // Injected observations test routing, not live vision accuracy. No user photo or AI request.
  for (const signals of [
    ['electrical_risk'],
    ['electrical_risk', 'electricity'],
    ['electrical_risk', 'fire'],
  ]) {
    const photos = [
      {
        media_id: id,
        status: 'informative',
        observations: [
          {
            text: 'Un interrupteur est cassé avec un fil apparent.',
            location: 'au centre',
          },
        ],
        safety_signals: signals,
      },
    ];
    const { result } = await analyze(
      {
        input: input(''),
        media: [{ id, path: 'fixture', sha256: hash(bytes) }],
      },
      {
        provider: {
          analyze: async () => ({
            result: sample({
              observations: photoObservations(photos),
              safety_signals: [],
              urgency: 'low',
            }),
            photoEvidence: photos,
            usage: {},
          }),
        },
        mediaStore: { download: async () => bytes },
      },
    );
    assert.equal(result.safety.stop, signals.length > 1);
    assert.equal(
      result.next,
      signals.length > 1 ? 'safety_stop' : 'qualification',
    );
    assert.equal(
      result.urgency.value,
      signals.length > 1 ? 'critical' : 'high',
    );
    assert.ok(
      result.facts.some(
        (f) => f.provenance === 'observed' && f.media_ids[0] === id,
      ),
    );
    for (const signal of signals)
      assert.ok(result.safety.signals.includes(signal));
  }
});

test('technical-risk result can enter the existing handoff with electrician and urgent context; critical results cannot', async () => {
  const env = {
    NODE_ENV: 'test',
    FIXEO_DIAGNOSTIC_SECRET: 'test-only-diagnostic-key'.repeat(2),
    FIXEO_ESTIMATOR_SECRET: 'test-only-estimator-key'.repeat(2),
  };
  const cfg = { ...config(env), enabled: true };
  const id = 'dc986e10-b315-4000-8000-2d458b457704',
    runId = 'ed986e10-b315-4000-8000-2d458b457705';
  const cookie = 'a'.repeat(64);
  const req = {
    method: 'POST',
    headers: {
      origin: cfg.origin,
      'x-fixeo-diagnostic': '1',
      'content-type': 'application/json',
      cookie: cfg.cookie + '=' + cookie,
    },
    body: { action: 'handoff', session_id: id, revision: 1 },
  };
  for (const [description, expected] of [
    ['Prise cassée.', 200],
    ['Prise cassée avec des flammes.', 409],
  ]) {
    const { result } = await run(description);
    const data = {
      session: {
        id,
        state: 'ready',
        revision: 1,
        selected_run_id: runId,
        city_slug: 'rabat',
        input: input(description),
      },
      run: { id: runId, revision: 1, state: 'complete', result },
    };
    const calls = [];
    const transport = {
      async rpc(name, args) {
        calls.push({ name, args });
        if (name === 'diagnostic_quota_v1') return {};
        assert.equal(name, 'diagnostic_state_v1');
        assert.equal(args.p_action, 'get');
        return data;
      },
    };
    const res = {
      setHeader() {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await createHandler({
      env,
      cfg,
      transport,
      mediaStore: {},
      logger: { warn() {} },
    })(req, res);
    assert.equal(res.statusCode, expected);
    assert.equal(
      calls.filter((c) => c.name === 'diagnostic_quota_v1').length,
      2,
      'Existing quota gates still run',
    );
    if (expected === 200) {
      assert.equal(res.body.entry_context.metier_hint, 'electricite');
      const body = { action: 'start', entry_context: res.body.entry_context };
      await beforeAction(req, res, body, env.FIXEO_ESTIMATOR_SECRET, {
        env,
        transport,
      });
      assert.equal(body.entry_context.metier_hint, 'electricite');
      assert.equal(body.entry_context.urgency, 'urgent');
      assert.equal(body.entry_context.city_slug, 'rabat');
    } else assert.equal(res.body.error, 'DIAGNOSTIC_NOT_QUALIFIED');
  }
});
