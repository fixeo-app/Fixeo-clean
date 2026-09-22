'use strict';
// Deterministic browser/real pricing-orchestrator integration. No network,
// Supabase writes or real reservations. NODE_PATH=tests/performance/node_modules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { JSDOM } = require('jsdom');
const o = require('../../data/pricing/orchestrator/estimator-orchestrator-v1');
const {
  normalizeSessionView,
  normalizeOutcomeView,
} = require('../../api/estimator-v1/fixeo-estimator-runtime-v1');
const plumbing = require('../../data/pricing/engine/plumbing-pilot-v1');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const source = process.env.FIXEO_UX_SOURCE
  ? fs.readFileSync(process.env.FIXEO_UX_SOURCE, 'utf8')
  : read('js/fixeo-estimator-v2.js');
const wait = async (predicate) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('UI state not reached');
};
function fixture(t, { baseline, width = 390, height = 844, delay, failAnswer = false } = {}) {
  const dom = new JSDOM(
    '<button id="open">Estimer</button><button id="fixeo-urgent-fab">Urgence</button><div class="chat-widget">WhatsApp</div>',
    { url: 'https://fixture.invalid', runScripts: 'outside-only', pretendToBeVisual: true },
  );
  const w = dom.window,
    calls = [],
    sessions = new Map();
  let lastStep,
    lastOutcome,
    answerCount = 0;
  // Disconnect the voice observer before tearing down JSDOM's document.
  const observers = [],
    Observer = w.MutationObserver;
  w.MutationObserver = class extends Observer {
    constructor(callback) {
      super(callback);
      observers.push(this);
    }
  };
  t.after(() => {
    observers.forEach((observer) => observer.disconnect());
    w.close();
  });
  w.innerWidth = width;
  w.innerHeight = height;
  w.FixeoEstimatorConfig = { estimatorV2Enabled: true };
  const viewport = new w.EventTarget();
  viewport.height = height;
  viewport.offsetTop = 0;
  w.visualViewport = viewport;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  const view = (s) => {
    const v = normalizeSessionView(s, 'fixture-only-key');
    sessions.set(v.session_token, structuredClone(s));
    return v;
  };
  function response(r, evaluated = false) {
    assert.equal(r.ok, true, JSON.stringify(r.error));
    const s = r.session;
    const step = o.getNextEstimatorStep(s).step;
    lastStep = step;
    lastOutcome = normalizeOutcomeView(s);
    return {
      ok: true,
      session: view(s),
      next_step: step,
      outcome: lastOutcome,
      ...(evaluated ? { pricing_context_token: 'fixture-price-token' } : {}),
    };
  }
  w.FixeoEstimatorAPI = {
    start: async (ctx) => {
      calls.push({ action: 'start', ctx: JSON.parse(JSON.stringify(ctx)) });
      return response(o.startEstimator(JSON.parse(JSON.stringify(ctx))));
    },
    selectService: async (token, code) => {
      calls.push({ action: 'select_service', code });
      return response(o.selectService(sessions.get(token), code));
    },
    answer: async (token, question_id, answer) => {
      calls.push({ action: 'answer', question_id, answer });
      answerCount++;
      if (delay) await delay();
      if (failAnswer && answerCount === 1) throw Error('offline');
      return response(o.answerEstimatorQuestion(sessions.get(token), question_id, answer));
    },
    evaluate: async (token) => {
      calls.push({ action: 'evaluate' });
      return response(o.evaluateEstimator(sessions.get(token)), true);
    },
  };
  for (const file of [
    'data/pricing/engine/plumbing-pilot-v1.js',
    'data/pricing/engine/electricity-pilot-v1.js',
    'data/pricing/engine/climatisation-pilot-v1.js',
    'data/pricing/engine/serrurerie-pilot-v1.js',
  ])
    w.eval(read(file));
  w.eval(
    (baseline || source).replace(
      '}());',
      "window.__ux={rankServiceChoices:typeof rankServiceChoices==='function'?rankServiceChoices:null,renderQuestion,STATE,get modal(){return _activeModal;}};}());",
    ),
  );
  const q = (id) => w.document.getElementById(id),
    click = (node) => {
      assert.ok(node);
      node.click();
    };
  const choose = async (value) => {
    const cards = [...w.document.querySelectorAll('#body-slot .answer-card')];
    const c = cards.find((c) => c.__optValue === value);
    assert.ok(c, 'choice ' + value);
    click(c);
    if (baseline && lastStep?.answer_type !== 'boolean') click(q('cta-primary'));
    await wait(() => !q('body-slot')?.contains(c));
  };
  const open = async (ctx = {}) => {
    await w.FixeoEstimatorV2.open({
      city: 'Rabat',
      description: 'Fuite simple visible',
      metier_hint: 'plomberie',
      ...ctx,
    });
    assert.ok(q('cta-primary'));
  };
  const start = async () => {
    click(q('cta-primary'));
    await wait(() => !!lastStep);
  };
  return {
    w,
    q,
    calls,
    viewport,
    choose,
    open,
    start,
    click,
    get step() {
      return lastStep;
    },
    get outcome() {
      return lastOutcome;
    },
  };
}
async function price(s, inputs) {
  while (s.step?.type === 'QUESTION') {
    await s.choose(inputs[s.step.input_id]);
  }
  await wait(() => !!s.outcome);
  return s.outcome;
}
const safeInputs = plumbing.services['plomberie.fuite_simple'].inputs;

test('A recommendation from server candidates → one-tap verified scope → same canonical price', async (t) => {
  const s = fixture(t);
  await s.open();
  await s.start();
  assert.ok(s.w.document.querySelector('.rafi-recommendation'));
  assert.ok(s.w.document.activeElement.classList.contains('question-heading'));
  assert.match(s.q('cta-primary').textContent, /Oui/);
  s.click(s.q('cta-primary'));
  await wait(() => s.step?.type === 'QUESTION');
  const out = await price(s, safeInputs);
  assert.equal(out.price.amount_mad, 280);
  assert.equal(s.calls.filter((x) => x.action === 'answer').length, 3);
  assert.equal(s.calls.filter((x) => x.action === 'select_service').length, 1);
  assert.match(s.q('cta-primary').textContent, /280|intervention|Confirmer|Réserver/);
  assert.ok(!s.calls.some((x) => x.action === 'confirm_request'));
});
test('B uncertain need shows at most three choices; ties or negation never become confident recommendations', async (t) => {
  const s = fixture(t);
  await s.open({ description: 'Un problème de plomberie' });
  await s.start();
  assert.equal(s.w.document.querySelector('.rafi-recommendation'), null);
  assert.equal(
    s.w.document.querySelectorAll('.rafi-choice-stack--services .answer-card').length,
    3,
  );
  const candidates = [
    { service_code: 'a', label_fr: 'Remplacement robinet' },
    { service_code: 'b', label_fr: 'Diagnostic robinet' },
  ];
  assert.equal(
    s.w.__ux.rankServiceChoices(candidates, { description: 'Pas de remplacement robinet' })
      .recommended,
    null,
  );
  assert.equal(
    s.w.__ux.rankServiceChoices(candidates, { description: 'Remplacement diagnostic robinet' })
      .recommended,
    null,
  );
});
test('C other interventions expands the exact server catalogue, never fabricates a choice', async (t) => {
  const s = fixture(t);
  await s.open({ description: 'Plomberie' });
  await s.start();
  const n = s.step.candidate_services.length;
  s.click(s.w.document.querySelector('.rafi-more-interventions'));
  assert.equal(
    s.w.document.querySelectorAll('.rafi-choice-stack--services .answer-card').length,
    n,
  );
  assert.ok(n > 3);
  assert.equal(s.calls.length, 1);
});
test('D unknown uses the exact approved UNKNOWN and server fallback without inventing a price', async (t) => {
  const s = fixture(t);
  await s.open({ service_hint: 'plomberie.fuite_simple' });
  await s.start();
  await s.choose('UNKNOWN');
  await price(s, safeInputs);
  assert.equal(s.outcome.outcome_type, 'QUOTE_REQUIRED');
  assert.equal(s.outcome.price?.amount_mad, null);
  assert.equal(s.calls.find((c) => c.action === 'answer').answer, 'UNKNOWN');
  assert.ok(!s.calls.some((c) => c.action === 'confirm_request'));
});
test('E known explicit inputs are not asked again; no client-created implicit eligibility', async (t) => {
  const s = fixture(t);
  await s.open({ service_hint: 'plomberie.fuite_simple', known_inputs: safeInputs });
  await s.start();
  await wait(() => !!s.outcome);
  assert.equal(s.calls.filter((c) => c.action === 'answer').length, 0);
  assert.equal(s.outcome.price.amount_mad, 280);
});
test('F back keeps answers, description, city and scroll; editing forks the existing opaque session', async (t) => {
  const s = fixture(t);
  await s.open({ service_hint: 'plomberie.fuite_simple' });
  await s.start();
  const first = s.step.question_id;
  s.q('body-slot').scrollTop = 90;
  await s.choose('LOCAL_ACCESSIBLE');
  s.click(s.q('rafi-step-back'));
  assert.equal(s.w.__ux.modal._view.step.question_id, first);
  assert.equal(s.w.__ux.STATE.pendingAnswer, 'LOCAL_ACCESSIBLE');
  assert.equal(s.q('body-slot').scrollTop, 90);
  assert.equal(s.w.__ux.modal._entryContext.city, 'Rabat');
  assert.equal(s.w.__ux.modal._entryContext.description, 'Fuite simple visible');
  await s.choose('LOCAL_ACCESSIBLE');
  assert.equal(s.step.input_id, 'plumbing_access');
});
test('all original tariff/safety conditions remain visible; no UNKNOWN is offered for boolean-only contracts', async (t) => {
  const s = fixture(t);
  await s.open({ service_hint: 'plomberie.fuite_simple' });
  await s.start();
  await s.choose('LOCAL_ACCESSIBLE');
  assert.match(s.q('body-slot').textContent, /inondation en cours/);
  assert.match(s.q('body-slot').textContent, /risque électrique/);
  assert.match(s.q('body-slot').textContent, /eau pouvant être fermée/);
  const body = s.w.__ux.renderQuestion(
    {
      input_id: 'burning_smell',
      question_id: 'burning_smell@fixture',
      answer_type: 'boolean',
      priority: 'SAFETY',
    },
    () => {},
  );
  assert.equal(body.querySelectorAll('.answer-card').length, 2);
  assert.doesNotMatch(body.textContent, /Je ne sais pas/);
});
test('one answer causes one request despite double click; an old response after back cannot advance the journey', async (t) => {
  let release;
  const s = fixture(t, { delay: () => new Promise((r) => (release = r)) });
  await s.open({ service_hint: 'plomberie.fuite_simple' });
  await s.start();
  const c = s.w.document.querySelector('.answer-card');
  c.click();
  c.click();
  assert.equal(s.calls.filter((x) => x.action === 'answer').length, 1);
  s.click(s.q('rafi-step-back'));
  release();
  await new Promise((r) => setImmediate(r));
  assert.ok(s.q('estimator-need-input'));
  assert.equal(s.w.__ux.modal._answerPending, false);
});
test('failed answer can be retried after back without losing context', async (t) => {
  const s = fixture(t, { failAnswer: true });
  await s.open({ service_hint: 'plomberie.fuite_simple' });
  await s.start();
  s.click(s.w.document.querySelector('.answer-card'));
  await wait(() => s.w.document.body.textContent.includes('Problème de connexion'));
  s.click(s.q('rafi-step-back'));
  await s.choose('LOCAL_ACCESSIBLE');
  assert.equal(s.step.input_id, 'plumbing_access');
  assert.equal(s.w.__ux.modal._entryContext.city, 'Rabat');
});
for (const width of [320, 390])
  test(
    'G/H/I/J/K viewport ' +
      width +
      ' keeps keyboard resize listeners, reserved footer, draft and focus intact',
    async (t) => {
      const s = fixture(t, { width });
      await s.open();
      assert.notEqual(s.w.document.activeElement.id, 'estimator-need-input');
      await new Promise((r) => s.w.requestAnimationFrame(r));
      const modal = s.w.document.querySelector('.estimator-modal');
      assert.equal(modal.style.getPropertyValue('--rafi-viewport-height'), '844px');
      s.viewport.height = 340;
      s.viewport.offsetTop = 50;
      s.viewport.dispatchEvent(new s.w.Event('resize'));
      await new Promise((r) => s.w.requestAnimationFrame(r));
      assert.equal(modal.style.getPropertyValue('--rafi-viewport-height'), '340px');
      assert.equal(modal.style.getPropertyValue('--rafi-viewport-top'), '50px');
      s.q('estimator-need-input').value = 'Mon brouillon conservé';
      s.w.FixeoEstimatorV2.close();
      assert.equal(s.w.document.body.classList.contains('fx-estimator-tunnel-active'), false);
      s.viewport.height = 400;
      s.viewport.dispatchEvent(new s.w.Event('resize'));
      await new Promise((r) => s.w.requestAnimationFrame(r));
      assert.equal(modal.style.getPropertyValue('--rafi-viewport-height'), '340px');
      await s.w.FixeoEstimatorV2.open({});
      assert.equal(s.q('estimator-need-input').value, 'Mon brouillon conservé');
      assert.equal(s.q('estimator-city-input').value, 'Rabat');
    },
  );
test('L unavailable microphone leaves typing and the initial CTA usable', async (t) => {
  const s = fixture(t);
  await s.open();
  s.w.eval(read('js/fixeo-estimation-voice-v1.js'));
  assert.equal(s.w.document.querySelector('.rafi-dictation button').disabled, true);
  assert.match(s.w.document.querySelector('.rafi-dictation-status').textContent, /écrire/);
  assert.equal(s.q('cta-primary').disabled, false);
});
test('M server price and all scope details stay available in a closed disclosure', async (t) => {
  const s = fixture(t);
  await s.open({ service_hint: 'plomberie.fuite_simple', known_inputs: safeInputs });
  await s.start();
  await wait(() => !!s.w.document.querySelector('.rafi-price-details'));
  const detail = s.w.document.querySelector('.rafi-price-details');
  assert.equal(detail.open, false);
  assert.match(detail.textContent, /Voir le détail du prix/);
  assert.match(detail.textContent, /raccord sanitaire visible/);
  assert.equal(s.w.document.querySelector('.price-display .amount').textContent, '280');
  assert.ok(!detail.contains(s.w.document.querySelector('.price-display')));
});
test('editing the need clears prior eligibility, while an unchanged need preserves explicit inputs', async (t) => {
  const s = fixture(t);
  await s.open({ service_hint: 'plomberie.fuite_simple', known_inputs: safeInputs });
  const modal = s.w.__ux.modal;
  modal._prepareDescription('Fuite simple visible');
  assert.deepEqual(JSON.parse(JSON.stringify(modal._entryContext.known_inputs)), safeInputs);
  modal._prepareDescription('Déboucher les WC');
  assert.deepEqual(JSON.parse(JSON.stringify(modal._entryContext.known_inputs)), {});
  assert.equal(modal._entryContext.service_hint, null);
  assert.equal(modal._entryContext.city, 'Rabat');
});
test('price disclosure preserves each server-provided financial component without changing the total', async (t) => {
  const s = fixture(t);
  await s.open({ service_hint: 'plomberie.fuite_simple', known_inputs: safeInputs });
  await s.start();
  await wait(() => !!s.outcome);
  s.w.__ux.modal._renderOutcome(s.w.__ux.STATE.session, {
    ...s.outcome,
    financial_breakdown: { vapMinor: 20000, commissionMinor: 8000, materialsMinor: 0 },
  });
  const detail = s.w.document.querySelector('.rafi-price-details');
  assert.equal(detail.open, false);
  assert.match(detail.textContent, /Prestation artisan : 200/);
  assert.match(detail.textContent, /Service FIXEO : 80/);
  assert.match(detail.textContent, /Fournitures incluses : 0/);
  assert.equal(s.w.document.querySelector('.price-display .amount').textContent, '280');
});
test('refused microphone permission is compact and preserves manual description and CTA', async (t) => {
  const s = fixture(t);
  await s.open();
  s.w.MediaRecorder = class {};
  s.q('estimator-need-input').getClientRects = () => [{}];
  s.w.navigator.mediaDevices = {
    getUserMedia: async () => {
      throw Error('permission denied');
    },
  };
  s.w.eval(read('js/fixeo-estimation-voice-v1.js'));
  s.click(s.w.document.querySelector('.rafi-dictation button'));
  await wait(() =>
    s.w.document.querySelector('.rafi-dictation-status').textContent.includes('Micro non autorisé'),
  );
  assert.equal(s.q('estimator-need-input').value, 'Fuite simple visible');
  assert.equal(s.q('cta-primary').disabled, false);
});
test('N/O changes remain modal-scoped, use existing server APIs and contain no pricing calculations', () => {
  const css = read('css/fixeo-estimator-v2.css').split('/* RAFI frictionless v4')[1];
  assert.doesNotMatch(css, /fxdiag|fxhf|estimation-page/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /body\.fx-estimator-tunnel-active #fixeo-urgent-fab/);
  assert.match(css, /min-height: 0; overflow-x: hidden; overflow-y: auto/);
  const ranking = source.slice(
    source.indexOf('  function rankServiceChoices('),
    source.indexOf('  function conciseQuestion('),
  );
  assert.doesNotMatch(ranking, /amount|price|known_inputs|fetch\(/);
  assert.match(source, /FixeoEstimatorAPI\.selectService/);
});

// Fixed identical scenarios: count navigation taps after the need/city are entered.
// Text typing/city entry excluded symmetrically; no live traffic or analytics.
test('measured same-input friction benchmark: no tariff questions silently removed', async (t) => {
  const cases = [
    {
      name: 'Fuite simple',
      code: 'plomberie.fuite_simple',
      text: 'Fuite simple visible',
      inputs: safeInputs,
    },
    {
      name: 'Robinet fourni',
      code: 'plomberie.robinet_remplacement',
      text: 'Remplacement robinet fourni par le client',
      inputs: plumbing.services['plomberie.robinet_remplacement'].inputs,
    },
    {
      name: 'Manutention',
      code: 'demenagement.manutention_2h',
      text: 'Manutention sur un même site',
      inputs: {
        moving_task: 'MOVING_HANDLING_ONLY',
        moving_access: 'MOVING_ACCESS_READY',
        moving_items: 'MOVING_STANDARD_ITEMS',
        moving_preparation: 'MOVING_PREPARED',
        moving_duration: 'MOVING_TWO_HOUR_TEAM',
      },
    },
  ];
  const metrics = [];
  const baseline = process.env.FIXEO_UX_BASELINE
    ? fs.readFileSync(process.env.FIXEO_UX_BASELINE, 'utf8')
    : null;
  for (const c of cases) {
    const variants = baseline
      ? [
          ['before', baseline],
          ['after', null],
        ]
      : [['after', null]];
    for (const [version, script] of variants) {
      const s = fixture(t, { baseline: script });
      await s.open({ description: c.text, metier_hint: c.code.split('.')[0] });
      await s.start();
      let taps = 1,
        questions = 0;
      if (s.w.document.querySelector('.rafi-recommendation')) s.click(s.q('cta-primary'));
      else {
        // Fixtures may have 1–3 candidates; expand only if the actual target is absent.
        let card = [...s.w.document.querySelectorAll('.answer-card')].find((x) =>
          x.textContent.includes(
            s.step.candidate_services.find((x) => x.service_code === c.code).label_fr,
          ),
        );
        if (!card) {
          s.click(s.w.document.querySelector('.rafi-more-interventions'));
          taps++;
          card = [...s.w.document.querySelectorAll('.answer-card')].find((x) =>
            x.textContent.includes(
              s.step.candidate_services.find((x) => x.service_code === c.code).label_fr,
            ),
          );
        }
        s.click(card);
      }
      taps++;
      await wait(() => s.step.type === 'QUESTION');
      while (s.step.type === 'QUESTION') {
        const step = s.step;
        questions++;
        taps += script && step.answer_type !== 'boolean' ? 2 : 1;
        await s.choose(c.inputs[step.input_id]);
      }
      await wait(() => !!s.outcome);
      assert.equal(s.outcome.outcome_type, 'PRICE_READY');
      metrics.push({
        scenario: c.name,
        version,
        taps,
        questions,
        screens: questions + 3,
        forced_keyboard: script ? 1 : 0,
        price: s.outcome.price.amount_mad,
      });
    }
  }
  if (baseline) {
    for (let i = 0; i < metrics.length; i += 2) {
      assert.equal(metrics[i].price, metrics[i + 1].price);
      assert.equal(metrics[i].questions, metrics[i + 1].questions);
    }
    const before = metrics.filter((x) => x.version === 'before').reduce((a, x) => a + x.taps, 0),
      after = metrics.filter((x) => x.version === 'after').reduce((a, x) => a + x.taps, 0);
    assert.ok((before - after) / before >= 0.4);
  }
  if (process.env.FIXEO_UX_METRICS)
    fs.writeFileSync(process.env.FIXEO_UX_METRICS, JSON.stringify(metrics, null, 2) + '\n');
});
