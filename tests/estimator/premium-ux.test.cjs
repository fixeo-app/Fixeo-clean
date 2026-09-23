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
  s.q('estimator-scroll').scrollTop = 90;
  await s.choose('LOCAL_ACCESSIBLE');
  s.click(s.q('rafi-step-back'));
  assert.equal(s.w.__ux.modal._view.step.question_id, first);
  assert.equal(s.w.__ux.STATE.pendingAnswer, 'LOCAL_ACCESSIBLE');
  assert.equal(s.q('estimator-scroll').scrollTop, 90);
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
for (const width of [320, 360, 390, 412])
  test(
    'G/H/I/J/K viewport ' +
      width +
      ' keeps keyboard resize listeners, intrinsic footer, draft and focus intact',
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
  detail.open = true;
  assert.match(detail.textContent, /raccord sanitaire visible/);
  assert.equal(s.w.document.querySelector('.price-display .amount').textContent, '280');
  assert.ok(s.q('rafi-step-back'));
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

// CSS contracts only: JSDOM does not lay out pixels or emulate native Safari.
// Resolve screen media rules so these checks exercise the shipped cascade.
function screenStyles(w, width, height, reduced = false) {
  const raw = w.document.createElement('style');
  raw.textContent = read('css/main.css').match(/select\{\n\s*color:#fff!important;[\s\S]*?\}/)[0] + '\n' + read('css/fixeo-estimator-v2.css');
  w.document.head.appendChild(raw);
  function applies(query) {
    return query.split(',').some((part) => {
      if (/prefers-reduced-motion:\s*reduce/.test(part) && !reduced) return false;
      if (/hover:\s*hover/.test(part)) return false;
      return [...part.matchAll(/(min|max)-(width|height):\s*([\d.]+)px/g)].every((m) => {
        const actual = m[2] === 'width' ? width : height;
        return m[1] === 'max' ? actual <= Number(m[3]) : actual >= Number(m[3]);
      });
    });
  }
  function flatten(rules) {
    return [...rules].map((rule) => rule.media
      ? (applies(rule.conditionText) ? flatten(rule.cssRules) : '')
      : rule.cssText).join('\n');
  }
  const resolved = flatten(raw.sheet.cssRules);
  raw.remove();
  w.document.querySelector('#fixture-screen-css')?.remove();
  const style = w.document.createElement('style');
  style.id = 'fixture-screen-css';
  style.textContent = resolved;
  w.document.head.appendChild(style);
}

test('premium choice list preserves server order and labels, including when recommendation ranking differs', async (t) => {
  const s = fixture(t);
  await s.open({ description: 'Remplacement robinet fourni par le client' });
  await s.start();
  const original = JSON.parse(JSON.stringify(s.step.candidate_services));
  const ranked = s.w.__ux.rankServiceChoices(s.step.candidate_services, {
    description: 'Remplacement robinet fourni par le client',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ranked.items)), original);
  if (s.w.document.querySelector('.rafi-more-interventions'))
    s.click(s.w.document.querySelector('.rafi-more-interventions'));
  const cards = [...s.w.document.querySelectorAll('.rafi-choice-card')];
  assert.deepEqual(cards.map((c) => c.querySelector('.rafi-choice-card__label').textContent), original.map((c) => c.label_fr));
  assert.deepEqual(cards.map((c) => c.querySelector('.rafi-choice-card__marker').textContent), original.map((_, i) => String(i + 1)));
  assert.deepEqual(JSON.parse(JSON.stringify(s.step.candidate_services)), original);
  cards[4].click();
  assert.equal(s.calls.find((call) => call.action === 'select_service').code, original[4].service_code);
});

test('scope disclosure preserves exact tariff conditions; safety and access precautions never fold', async (t) => {
  const s = fixture(t);
  await s.open({ service_hint: 'plomberie.fuite_simple' });
  await s.start();
  const question = s.step;
  const disclosure = s.w.document.querySelector('.rafi-question-details');
  assert.ok(disclosure);
  assert.equal(disclosure.open, false);
  assert.equal(disclosure.querySelector('.rafi-question-conditions').textContent, question.prompt_fr);
  const options = [...s.w.document.querySelectorAll('.answer-card')].map((c) => c.__optValue);
  disclosure.open = true;
  assert.deepEqual([...s.w.document.querySelectorAll('.answer-card')].map((c) => c.__optValue), options);
  await s.choose('LOCAL_ACCESSIBLE');
  assert.equal(s.q('question-conditions').closest('details'), null);
  assert.equal(s.q('question-conditions').textContent, s.step.prompt_fr);
  const safety = s.w.__ux.renderQuestion({
    input_id: 'plumbing_scope', question_id: 'safety@fixture', priority: 'SAFETY',
    answer_type: 'boolean', prompt_fr: 'Danger immédiat : éloignez-vous de la zone et contactez les secours.',
  }, () => {});
  assert.equal(safety.querySelector('.rafi-question-conditions').closest('details'), null);
  assert.equal(safety.querySelectorAll('.answer-card').length, 2);
});

for (const width of [320, 360, 390, 412]) {
  test('premium CSS contract ' + width + ': all four labels, intrinsic action flow, long copy and keyboard', async (t) => {
    const s = fixture(t, { width });
    await s.open();
    for (const height of [844, 480, 340]) {
      screenStyles(s.w, width, height);
      const style = (selector) => s.w.getComputedStyle(s.w.document.querySelector(selector));
      assert.equal(style('.rafi-state-bar').gridTemplateColumns, 'repeat(4, minmax(0, 1fr))');
      assert.deepEqual([...s.w.document.querySelectorAll('.rafi-stage-label')].map((el) => el.textContent), ['Comprendre', 'Identifier', 'Vérifier', 'Prix FIXEO']);
      assert.notEqual(style('.rafi-stage-index').display, 'none');
      assert.equal(style('.rafi-stage-label').textOverflow, 'clip');
      assert.equal(style('.rafi-stage-label').whiteSpace, 'normal');
      assert.equal(style('#body-slot').minHeight, '0');
      assert.equal(style('#estimator-scroll').overflowY, 'auto');
      assert.equal(style('#body-slot').flexGrow, '0');
      assert.equal(style('#body-slot').overflow, 'visible');
      assert.equal(style('.estimator-modal').height, 'auto');
      assert.equal(s.q('footer-slot').parentElement, s.q('estimator-scroll'));
      assert.equal(s.q('body-slot').nextElementSibling, s.q('footer-slot'));
      assert.equal(style('#footer-slot').marginTop, '24px');
      assert.equal(style('.rafi-understand-hero').borderTopWidth, '0px');
      assert.equal(style('.rafi-understand-hero').minHeight, '0');
      assert.equal(style('.rafi-sphere-wrap').display, 'none');
      assert.equal(style('.rafi-stage-index').height, '12px');
      assert.equal(style('#footer-slot').position, 'static');
      assert.equal(style('#footer-slot').flexShrink, '0');
      assert.equal(style('.estimator-need-input').fontSize, '16px');
      assert.equal(style('#fixeo-urgent-fab').visibility, 'hidden');
      assert.equal(style('.chat-widget').visibility, 'hidden');
    }
    s.q('estimator-need-input').value = 'Un besoin détaillé avec plusieurs précisions utiles. '.repeat(15);
    s.q('estimator-need-input').focus();
    assert.equal(s.w.document.activeElement.id, 'estimator-need-input');
    const draft = s.q('estimator-need-input').value.trim();
    s.w.FixeoEstimatorV2.close();
    await s.w.FixeoEstimatorV2.open({});
    assert.equal(s.q('estimator-need-input').value, draft);
    screenStyles(s.w, width, 844, true);
    assert.equal(s.w.getComputedStyle(s.q('cta-primary')).getPropertyValue('transition'), 'none');
  });
}

test('homepage gateway retains the existing city-aware opening action and accessible label', () => {
  const html = read('index.html');
  const section = html.match(/<section\s+id="fixeo-estimation-signature"[\s\S]*?<\/section>/)[0];
  const script = html.slice(html.indexOf(section) + section.length).match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = new JSDOM('<select id="fxhf-location"><option selected>Fès</option></select>' + section,
    { runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    let context;
    dom.window.FixeoEstimatorV2 = { open: (value) => { context = value; return Promise.resolve(); } };
    dom.window.eval(script);
    const button = dom.window.document.getElementById('fxes-open-estimator');
    assert.equal(button.type, 'button');
    assert.match(button.getAttribute('aria-label'), /Estimer mon intervention/);
    button.click();
    assert.equal(context.city, 'Fès');
    assert.match(dom.window.document.getElementById('fxes-title').textContent, /Sachez combien ça devrait coûter/);
  } finally { dom.window.close(); }
});

function officialHeader(s, initialHeight = 84) {
  const header = s.w.document.createElement('header');
  header.className = 'fixeo-gh-universal-shell';
  header.innerHTML = '<div class="fixeo-gh-mobile-bar"><a href="/" id="fixture-logo">FIXEO</a><button id="fixture-menu">Menu</button></div>';
  s.w.document.body.prepend(header);
  const bar = header.firstElementChild;
  let height = initialHeight;
  bar.getBoundingClientRect = () => ({ top: 0, bottom: height, height, left: 0, width: s.w.innerWidth });
  return { header, bar, setHeight(value) { height = value; } };
}

for (const width of [320, 360, 390, 412]) {
  test('FIXEO header reservation ' + width + ': measured safe area once, keyboard pan and short viewport', async (t) => {
    const s = fixture(t, { width });
    const h = officialHeader(s);
    const originalHeader = h.header.outerHTML;
    let resize, disconnected = false;
    const observed = new Set();
    s.w.ResizeObserver = class {
      constructor(callback) { resize = callback; }
      observe(node) { observed.add(node); }
      unobserve(node) { observed.delete(node); }
      disconnect() { disconnected = true; }
    };
    await s.open();
    await new Promise((r) => s.w.requestAnimationFrame(r));
    const root = s.q('fixeo-estimator-v2-root');
    assert.equal(root.style.getPropertyValue('--rafi-panel-top'), '84px');
    assert.equal(root.style.getPropertyValue('--rafi-panel-height'), '760px');
    assert.equal(root.querySelector('[role=dialog]').getAttribute('aria-modal'), 'false');
    assert.ok(observed.has(h.bar));
    assert.ok(s.q('estimator-scroll').contains(s.q('cta-primary')));
    s.viewport.height = 340; s.viewport.offsetTop = 50;
    s.viewport.dispatchEvent(new s.w.Event('resize'));
    await new Promise((r) => s.w.requestAnimationFrame(r));
    assert.equal(root.style.getPropertyValue('--rafi-panel-top'), '84px');
    assert.equal(root.style.getPropertyValue('--rafi-panel-height'), '306px');
    assert.equal(root.dataset.compactViewport, 'true');
    h.setHeight(108); resize();
    await new Promise((r) => s.w.requestAnimationFrame(r));
    assert.equal(root.style.getPropertyValue('--rafi-panel-height'), '282px');
    s.viewport.offsetTop = 130;
    s.viewport.dispatchEvent(new s.w.Event('scroll'));
    await new Promise((r) => s.w.requestAnimationFrame(r));
    assert.equal(root.style.getPropertyValue('--rafi-panel-top'), '130px');
    assert.equal(root.style.getPropertyValue('--rafi-panel-height'), '340px');
    assert.equal(h.header.outerHTML, originalHeader, 'global header is never cloned, moved or restyled');
    s.w.FixeoEstimatorV2.close();
    assert.equal(disconnected, true);
    assert.equal(h.header.outerHTML, originalHeader);
  });
}

test('header controls remain interactive and keyboard navigation skips the obscured homepage', async (t) => {
  const s = fixture(t);
  const h = officialHeader(s);
  let menuClicks = 0;
  s.q('fixture-menu').onclick = () => menuClicks++;
  await s.open();
  for (const node of s.w.document.querySelectorAll('button,a,input,select,textarea'))
    Object.defineProperty(node, 'offsetWidth', { get: () => 44 });
  s.click(s.q('fixture-menu'));
  assert.equal(menuClicks, 1);
  const tab = (id, shiftKey = false) => {
    s.q(id).focus();
    const event = new s.w.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    s.q(id).dispatchEvent(event);
    return event;
  };
  tab('fixture-menu'); assert.equal(s.w.document.activeElement.id, 'modal-close');
  tab('modal-close', true); assert.equal(s.w.document.activeElement.id, 'fixture-menu');
  tab('cta-primary'); assert.equal(s.w.document.activeElement.id, 'fixture-logo');
  tab('fixture-logo', true); assert.equal(s.w.document.activeElement.id, 'cta-primary');
  s.click(s.q('modal-close'));
  assert.equal(tab('fixture-menu').defaultPrevented, false, 'no stale focus handler after close');
  assert.equal(h.header.hasAttribute('inert'), false);
});

test('keyboard scrolls the focused field in the same surface as the CTA, with no reserved footer gap', async (t) => {
  const s = fixture(t);
  officialHeader(s, 60);
  await s.open();
  const surface = s.q('estimator-scroll'), field = s.q('estimator-need-input');
  surface.getBoundingClientRect = () => ({ top: 120, bottom: 390, height: 270 });
  field.getBoundingClientRect = () => ({ top: 410 - surface.scrollTop, bottom: 498 - surface.scrollTop, height: 88 });
  field.focus();
  s.viewport.height = 400;
  s.viewport.dispatchEvent(new s.w.Event('resize'));
  await new Promise((r) => s.w.requestAnimationFrame(r));
  assert.equal(surface.scrollTop, 124);
  assert.equal(field.getBoundingClientRect().bottom, 374);
  assert.equal(s.q('footer-slot').parentElement, surface);
  assert.equal(s.q('body-slot').nextElementSibling, s.q('footer-slot'));
  assert.equal(s.w.document.querySelector('.estimator-modal').style.getPropertyValue('--rafi-actions-height'), '');
  assert.equal(field.value, 'Fuite simple visible');
});

for (const outcomeType of ['PRICE_READY', 'LABOUR_PLUS_PART_READY', 'DIAGNOSTIC_READY']) {
  test('flagship price decision ' + outcomeType + ': amount first, complete terms folded, identical CTA authority', async (t) => {
    const s = fixture(t);
    await s.open({ service_hint: 'plomberie.fuite_simple', known_inputs: safeInputs });
    await s.start();
    await wait(() => !!s.outcome);
    const outcome = { ...s.outcome, outcome_type: outcomeType,
      service_code: outcomeType === 'DIAGNOSTIC_READY' ? 'serrurerie.diagnostic' : s.outcome.service_code,
      price: { amount_mad: 220, labour_amount_mad: 150 },
      scope_summary: ['Déplacement pour une seule visite', 'Contrôle du périmètre sans remplacement de pièce'],
      exclusions_summary: ['Toute pièce est exclue'],
      financial_breakdown: {vapMinor: 14000, commissionMinor: 8000, materialsMinor: 0} };
    const original = JSON.stringify(outcome);
    s.w.__ux.modal._renderOutcome(s.w.__ux.STATE.session, outcome);
    const detail = s.w.document.querySelector('.rafi-price-details');
    const amount = s.w.document.querySelector('.price-display .amount, .labour-card-amount .amount');
    const name = s.w.document.querySelector('.price-certificate__service-name, .result-service-name');
    assert.equal(detail.open, false);
    assert.equal(amount.textContent, outcomeType === 'LABOUR_PLUS_PART_READY' ? '150' : '220');
    assert.ok(amount.compareDocumentPosition(name) & s.w.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(amount.closest('details'), null);
    assert.ok(s.q('cta-primary').textContent.includes(outcomeType === 'LABOUR_PLUS_PART_READY' ? '150' : '220'));
    if (outcomeType === 'PRICE_READY') {
      assert.match(detail.textContent, /Toute pièce est exclue/);
      assert.match(detail.textContent, /Si la situation réelle est différente, aucun supplément/);
    } else if (outcomeType === 'DIAGNOSTIC_READY') {
      for (const scope of outcome.scope_summary) assert.ok(detail.textContent.includes(scope));
      assert.match(detail.textContent, /Les 220 MAD déjà versés sont déduits ; un seul frais FIXEO/);
      assert.match(detail.textContent, /autres travaux et seconde visite sur devis/);
    } else {
      assert.match(detail.textContent, /Pièce \/ matériel/);
      assert.match(detail.textContent, /approuvé avant installation/);
    }
    assert.match(detail.textContent, /Prestation artisan : 140/);
    detail.open = true;
    assert.equal(JSON.stringify(outcome), original, 'presentation must not mutate the verified outcome');
    let handoff;
    s.w.document.addEventListener('fixeo:estimator-reserve', e => { handoff = e.detail; });
    s.q('cta-primary').click();
    assert.deepEqual(JSON.parse(JSON.stringify(handoff)), {pricing_context_token: 'fixture-price-token'});
  });
}

for (const width of [320, 360, 390, 412]) {
  test('flagship confirmation ' + width + ': FIXEO shell, Fès, gradient, keyboard and unchanged return', async (t) => {
    const s = fixture(t, {width});
    const h = officialHeader(s, 84), headerBefore = h.header.outerHTML;
    const calls = [];
    s.w.FixeoEstimatorAPI.verifyPricingContext = async token => {
      calls.push(token);
      return {valid: true, outcome_type: 'DIAGNOSTIC_READY', amount_mad: 220,
        city_slug: 'fes', service_label: 'Diagnostic serrurerie sur place'};
    };
    s.w.FixeoEstimatorAPI.confirmRequest = () => { throw Error('No reservation allowed in presentation tests'); };
    s.w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    s.w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    s.w.eval(read('js/fixeo-estimator-reservation-bridge-v1.js'));
    await s.open();
    const draft = s.q('estimator-need-input').value;
    const bridge = s.w.FixeoEstimatorReservationBridge;
    bridge.prepareContext('fixture-price-token');
    bridge.openConfirmation('fixture-price-token');
    await wait(() => !s.w.document.querySelector('.fx-est-confirm-primary').disabled);
    screenStyles(s.w, width, 844);
    const dialog = s.w.document.querySelector('dialog.fx-est-confirm');
    const style = node => s.w.getComputedStyle(node);
    assert.equal(dialog.style.getPropertyValue('--fx-confirm-top'), '84px');
    assert.equal(dialog.style.getPropertyValue('--fx-confirm-height'), '760px');
    assert.match(dialog.querySelector('.fx-est-confirm-summary').textContent, /Fès — 220 MAD pour le diagnostic/);
    assert.match(dialog.textContent, /Téléphone pour organiser l’intervention/);
    const button = dialog.querySelector('.fx-est-confirm-primary');
    assert.equal(style(button).background, 'var(--fx-est-cta)');
    assert.match(style(dialog).getPropertyValue('--fx-est-cta'), /linear-gradient\(112deg/);
    assert.equal(style(button).minHeight, '52px');
    assert.equal(style(dialog).overflowY, 'auto');
    assert.equal(style(s.q('fixeo-urgent-fab')).visibility, 'hidden');
    assert.equal(style(s.w.document.querySelector('.chat-widget')).visibility, 'hidden');
    assert.equal(s.q('fx-est-confirm-phone').type, 'tel');
    const phone = s.q('fx-est-confirm-phone');
    phone.getBoundingClientRect = () => ({top: 350 - dialog.scrollTop, bottom: 398 - dialog.scrollTop});
    phone.focus();
    s.viewport.height = 340; s.viewport.offsetTop = 0;
    s.viewport.dispatchEvent(new s.w.Event('resize'));
    await new Promise(r => s.w.requestAnimationFrame(r));
    assert.equal(dialog.style.getPropertyValue('--fx-confirm-height'), '256px');
    assert.equal(dialog.scrollTop, 74);
    assert.equal(phone.getBoundingClientRect().bottom, 324);
    s.viewport.height = 844;
    s.viewport.dispatchEvent(new s.w.Event('resize'));
    await new Promise(r => s.w.requestAnimationFrame(r));
    assert.equal(dialog.style.getPropertyValue('--fx-confirm-height'), '760px');
    dialog.querySelector('.fx-est-confirm-back').click();
    assert.equal(s.w.document.querySelector('dialog.fx-est-confirm'), null);
    assert.equal(s.w.document.querySelector('.fx-est-confirm-shade'), null);
    assert.equal(s.q('estimator-need-input').value, draft);
    assert.equal(s.q('fixeo-estimator-v2-root').style.visibility, '');
    assert.equal(bridge.getContext(), 'fixture-price-token');
    assert.deepEqual(calls, ['fixture-price-token']);
    assert.equal(h.header.outerHTML, headerBefore);
  });
}

test('clean homepage return preserves an old price token and opens a new estimation normally', async (t) => {
  const s = fixture(t);
  s.w.document.documentElement.setAttribute('data-fixeo-clean-home', '');
  s.w.eval(read('js/fixeo-estimator-reservation-bridge-v1.js'));
  s.w.eval(read('js/fixeo-hero-resume-v1.js'));
  await s.open({service_hint: 'plomberie.fuite_simple', known_inputs: safeInputs});
  await s.start(); await wait(() => !!s.outcome);
  const bridge = s.w.FixeoEstimatorReservationBridge;
  bridge.prepareContext('fixture-price-token');
  s.w.FixeoEstimatorV2.close();
  s.w.FixeoHeroResume.refresh();
  assert.equal(s.w.document.getElementById('fxhro-card'), null);
  assert.equal(bridge.getContext(), 'fixture-price-token');
  await s.open({description: 'Mon lavabo est bouché', service_hint: null, known_inputs: {}});
  assert.equal(s.q('estimator-need-input').value, 'Mon lavabo est bouché');
  assert.equal(s.q('cta-primary').disabled, false);
  await s.start();
  await wait(() => s.calls.filter(c => c.action === 'start').length === 2);
  assert.equal(s.calls.filter(c => c.action === 'start')[1].ctx.description, 'Mon lavabo est bouché');
  assert.equal(s.w.document.getElementById('fxhro-card'), null);
});

for (const width of [320, 360, 390, 412]) {
  test('final flagship ' + width + ': airy header, restrained native controls and full-color CTA states', async (t) => {
    const s = fixture(t, {width});
    officialHeader(s);
    await s.open({description: '', city: 'Fès', metier_hint: null});
    s.w.MediaRecorder = class {};
    s.w.navigator.mediaDevices = {getUserMedia: async () => {throw Error('Fixture: permission not granted');}};
    s.w.eval(read('js/fixeo-estimation-voice-v1.js'));
    screenStyles(s.w, width, 844);
    const style = el => s.w.getComputedStyle(el);
    const header = s.q('estimator-header'), modal = s.w.document.querySelector('.estimator-modal');
    assert.equal(style(header).minHeight, '76px');
    // JSDOM retains unresolved shorthand tokens; the browser resolves the gutter.
    assert.equal(style(header).padding, '16px var(--rafi-gutter)');
    assert.equal(style(s.q('modal-close')).height, '44px');
    assert.match(style(modal).animation, /fx-estimation-open .22s/);
    assert.equal(style(s.q('body-slot')).flexGrow, '0');
    assert.equal(style(s.q('footer-slot')).position, 'static');
    assert.equal(style(s.q('footer-slot')).marginTop, '24px');
    const city = s.q('estimator-city-input'), language = s.w.document.querySelector('.rafi-dictation select');
    assert.equal(city.tagName, 'SELECT');
    assert.equal(language.tagName, 'SELECT');
    assert.equal(city.value, 'Fès');
    assert.deepEqual([...language.options].map(o => o.value), ['fr-FR', 'ar-MA']);
    for (const control of [city, language]) {
      assert.equal(control.disabled, false);
      assert.equal(style(control).appearance, 'none');
      assert.equal(style(control).minHeight, '44px');
      assert.equal(style(control).fontSize, '16px', 'no Safari focus zoom');
      assert.equal(style(control).backgroundColor, 'rgba(255, 255, 255, 0.016)', 'global select fill must not leak');
      assert.match(style(control).backgroundImage, /svg/);
      assert.ok(control.getAttribute('aria-label'));
      control.focus(); assert.equal(s.w.document.activeElement, control);
    }
    assert.equal(style(city.parentElement).borderTopWidth, '0px');
    assert.equal(style(city.parentElement).backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.equal(style(s.w.document.querySelector('.rafi-dictation button')).borderTopWidth, '0px');
    assert.equal(style(s.w.document.querySelector('.rafi-dictation-status')).fontWeight, '400');
    const cta = s.q('cta-primary');
    assert.equal(cta.disabled, true);
    assert.equal(style(cta).filter, 'none');
    assert.equal(style(cta).appearance, 'none');
    assert.equal(style(cta).background, 'var(--fx-est-cta-muted)');
    const field = s.q('estimator-need-input');
    field.value = 'Une fuite sous mon évier. '.repeat(15);
    field.dispatchEvent(new s.w.Event('input', {bubbles: true}));
    assert.equal(cta.disabled, false);
    assert.equal(style(cta).background, 'var(--fx-est-cta)');
    assert.equal(style(cta).filter, 'none');
    language.value = 'ar-MA'; language.dispatchEvent(new s.w.Event('change', {bubbles: true}));
    assert.equal(language.value, 'ar-MA'); assert.equal(city.value, 'Fès');
    s.viewport.height = 340; field.focus();
    s.viewport.dispatchEvent(new s.w.Event('resize'));
    await new Promise(r => s.w.requestAnimationFrame(r));
    assert.equal(style(header).minHeight, '60px');
    assert.equal(s.q('estimator-scroll').contains(cta), true);
    s.viewport.height = 844; s.viewport.dispatchEvent(new s.w.Event('resize'));
    await new Promise(r => s.w.requestAnimationFrame(r));
    assert.equal(style(header).minHeight, '76px');
    screenStyles(s.w, width, 844, true);
    assert.equal(style(modal).animation, 'none');
  });
}

test('flagship service rows keep the exact choices and remove the inherited inner padding', async t => {
  const s = fixture(t);
  await s.open({description: 'Un problème de plomberie'}); await s.start();
  screenStyles(s.w, 390, 844);
  const cards = [...s.w.document.querySelectorAll('.rafi-choice-card--service')];
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(c => c.querySelector('.rafi-choice-card__label').textContent), s.step.candidate_services.slice(0, 3).map(c => c.label_fr));
  for (const card of cards) {
    assert.equal(s.w.getComputedStyle(card).minHeight, '60px');
    assert.equal(s.w.getComputedStyle(card.querySelector('.rafi-choice-card__content')).padding, '0px');
    const arrow = s.w.getComputedStyle(card.querySelector('.rafi-choice-card__arrow'));
    assert.equal(arrow.backgroundColor, 'rgba(0, 0, 0, 0)'); assert.equal(arrow.borderTopWidth, '0px');
  }
});

test('one canonical gradient spans entry, modal and confirmation without editing the assistant', () => {
  const hero = read('css/fixeo-hero-flagship-v1.css').match(/--fxhf-cta-gradient:\s*([^;]+);/)[1];
  const css = read('css/fixeo-estimator-v2.css');
  assert.equal(css.match(/--fx-est-cta:\s*([^;]+);/)[1], hero);
  assert.match(read('css/fixeo-estimation-signature-v1.css'), /--fxes-cta: var\(--fx-est-cta,/);
  assert.match(css, /dialog\.fx-est-confirm \.fx-est-confirm-primary \{[\s\S]*?background: var\(--fx-est-cta\)/);
});

test('entry visibility protects its content from both floating actions and restores them on leaving', () => {
  const html = read('index.html');
  const section = html.match(/<section\s+id="fixeo-estimation-signature"[\s\S]*?<\/section>/)[0];
  const script = html.slice(html.indexOf(section) + section.length).match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = new JSDOM('<style>' + read('css/fixeo-estimation-signature-v1.css') + '</style>' + section +
    '<button id="fixeo-urgent-fab">Urgence</button><a class="chat-widget" href="/whatsapp.html">WhatsApp</a>',
    {runScripts: 'outside-only', pretendToBeVisual: true});
  try {
    const w = dom.window; let visibility, observed, opened;
    w.IntersectionObserver = class { constructor(callback) {visibility = callback;} observe(node) {observed = node;} };
    w.FixeoEstimatorV2 = {open: ctx => {opened = ctx;}};
    w.eval(script);
    assert.equal(observed.id, 'fixeo-estimation-signature');
    visibility([{isIntersecting:true}]);
    for (const el of w.document.querySelectorAll('#fixeo-urgent-fab,.chat-widget')) {
      assert.equal(w.getComputedStyle(el).visibility, 'hidden');
      assert.equal(w.getComputedStyle(el).pointerEvents, 'none');
    }
    w.document.getElementById('fxes-open-estimator').click();
    assert.equal(opened.source, 'homepage_estimation_signature');
    visibility([{isIntersecting:false}]);
    assert.equal(w.document.body.classList.contains('fx-estimation-entry-visible'), false);
    assert.equal(w.document.querySelector('.chat-widget').getAttribute('href'), '/whatsapp.html');
    const dot = w.document.querySelector('.fxes__signal-dot');
    assert.equal(w.getComputedStyle(dot).pointerEvents, 'none');
    assert.equal(w.getComputedStyle(dot).width, '12px');
  } finally {dom.window.close();}
});
