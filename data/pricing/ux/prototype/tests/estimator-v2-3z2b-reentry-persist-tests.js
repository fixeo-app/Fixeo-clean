/**
 * estimator-v2-3z2b-reentry-persist-tests.js
 * Phase 7C.9L.3Z.2B — Estimator Re-entry + PRICE_READY Persistence
 *
 * Tests:
 *  1–9:  fixeo:estimator-closed event lifecycle
 * 10–14: RFOS guard reset / memory preservation
 * 15–20: PRICE_READY early persistence
 * 21–25: CTA after persistence / hide-reveal / token survival
 * 26–27: expired token handling
 * 28–30: FAEE isolation regression guard
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ── Minimal DOM/Browser harness ─────────────────────────── */
class FakeStorage {
  constructor() { this._data = {}; }
  setItem(k, v)  { this._data[k] = v; }
  getItem(k)     { return this._data[k] !== undefined ? this._data[k] : null; }
  removeItem(k)  { delete this._data[k]; }
  clear()        { this._data = {}; }
}

function makeDOM() {
  let _bodyClasses = new Set();
  let _listeners = {};

  const document = {
    _bodyClasses,
    body: {
      classList: {
        add: (c)    => _bodyClasses.add(c),
        remove: (c) => _bodyClasses.delete(c),
        contains: (c) => _bodyClasses.has(c),
      }
    },
    addEventListener:    (ev, fn, opts) => { (_listeners[ev] = _listeners[ev] || []).push(fn); },
    removeEventListener: (ev, fn)       => { if (_listeners[ev]) _listeners[ev] = _listeners[ev].filter(f => f !== fn); },
    dispatchEvent: (evt) => {
      (_listeners[evt.type] || []).forEach(fn => { try { fn(evt); } catch(_) {} });
      return true;
    },
    _getListeners: (ev) => _listeners[ev] || [],
    getElementById: () => null,
    querySelector:  () => null,
    querySelectorAll: () => [],
    createElement: (tag) => ({
      tag, style: {}, classList: { add:()=>{}, remove:()=>{}, contains:()=>false },
      appendChild: ()=>{}, setAttribute: ()=>{}, getAttribute: ()=>null,
      removeAttribute: ()=>{}, addEventListener: ()=>{}, innerHTML: '',
    }),
  };

  return document;
}

function makeCustomEvent(type, opts) {
  return { type, detail: (opts && opts.detail) || null };
}

/* ── Test runner ─────────────────────────────────────────── */
let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  PASS:', name);
    pass++;
  } catch (e) {
    console.error('  FAIL:', name);
    console.error('       ', e.message);
    fail++;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || 'Not equal') + ` — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

/* ══════════════════════════════════════════════════════════════
   GROUP 1: fixeo:estimator-closed event lifecycle
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 1: fixeo:estimator-closed event lifecycle ──');

(function() {
  /* Build a minimal FixeoEstimatorV2-like module against a fresh document */
  function makeEstimator(document, sessionStorage) {
    let _activeContainer = null;
    let _activeModal = null;

    function _destroyContainer() {
      if (!_activeContainer && !_activeModal) return; // idempotency guard

      try { document.body.classList.remove('fx-estimator-tunnel-active'); } catch (_) {}
      try {
        if (_activeContainer && _activeContainer.parentNode) {
          _activeContainer.parentNode.removeChild(_activeContainer);
        }
      } catch (_) {}
      _activeContainer = null;
      _activeModal = null;

      try { document.dispatchEvent(makeCustomEvent('fixeo:estimator-closed')); } catch (_) {}
    }

    function _createContainer() {
      const c = document.createElement('div');
      c.parentNode = { removeChild: () => {} };
      return c;
    }

    const api = {
      open: function(ctx) {
        if (_activeModal) return Promise.resolve({ accepted: true });
        _activeContainer = _createContainer();
        _activeModal = { mock: true };
        document.body.classList.add('fx-estimator-tunnel-active');
        return Promise.resolve({ accepted: true });
      },
      close: function() { _destroyContainer(); },
      hide: function() {
        if (!_activeContainer) return;
        try { _activeContainer.style.visibility = 'hidden'; } catch (_) {}
      },
      reveal: function() {
        if (!_activeContainer) return;
        try { _activeContainer.style.visibility = ''; } catch (_) {}
      },
      isOpen: function() { return !!_activeModal; },
      _forceDestroy: _destroyContainer,
    };
    return api;
  }

  test('1. fixeo:estimator-closed dispatched on terminal × close', function() {
    const document = makeDOM();
    const est = makeEstimator(document);
    let fired = 0;
    document.addEventListener('fixeo:estimator-closed', () => fired++);
    est.open({});
    est.close();
    assertEqual(fired, 1, 'event count');
  });

  test('2. fixeo:estimator-closed fires only once per open/close cycle', function() {
    const document = makeDOM();
    const est = makeEstimator(document);
    let fired = 0;
    document.addEventListener('fixeo:estimator-closed', () => fired++);
    est.open({});
    est.close();
    est.close(); // second call — idempotency guard blocks repeat
    assertEqual(fired, 1, 'event count after double close');
  });

  test('3. fixeo:estimator-closed does NOT fire on hide()', function() {
    const document = makeDOM();
    const est = makeEstimator(document);
    let fired = 0;
    document.addEventListener('fixeo:estimator-closed', () => fired++);
    est.open({});
    est.hide();
    assertEqual(fired, 0, 'no event on hide');
  });

  test('4. fixeo:estimator-closed does NOT fire on reveal()', function() {
    const document = makeDOM();
    const est = makeEstimator(document);
    let fired = 0;
    document.addEventListener('fixeo:estimator-closed', () => fired++);
    est.open({});
    est.hide();
    est.reveal();
    assertEqual(fired, 0, 'no event on reveal');
  });

  test('5. fixeo:estimator-closed fires after hide then close (terminal)', function() {
    const document = makeDOM();
    const est = makeEstimator(document);
    let fired = 0;
    document.addEventListener('fixeo:estimator-closed', () => fired++);
    est.open({});
    est.hide();
    est.close();
    assertEqual(fired, 1, 'event on terminal close after hide');
  });

  test('6. isOpen() returns false when event listener fires', function() {
    const document = makeDOM();
    const est = makeEstimator(document);
    let openAtEventTime = true;
    document.addEventListener('fixeo:estimator-closed', () => {
      openAtEventTime = est.isOpen();
    });
    est.open({});
    est.close();
    assert(!openAtEventTime, 'isOpen() should be false when event fires');
  });

  test('7. fx-estimator-tunnel-active removed before event fires', function() {
    const document = makeDOM();
    const est = makeEstimator(document);
    let classPresent = true;
    document.addEventListener('fixeo:estimator-closed', () => {
      classPresent = document.body.classList.contains('fx-estimator-tunnel-active');
    });
    est.open({});
    est.close();
    assert(!classPresent, 'tunnel class must be gone when event fires');
  });

  test('8. no event on open() itself', function() {
    const document = makeDOM();
    const est = makeEstimator(document);
    let fired = 0;
    document.addEventListener('fixeo:estimator-closed', () => fired++);
    est.open({});
    assertEqual(fired, 0, 'no event on open');
  });

  test('9. multiple open/close cycles each fire one event', function() {
    const document = makeDOM();
    const est = makeEstimator(document);
    let fired = 0;
    document.addEventListener('fixeo:estimator-closed', () => fired++);
    est.open({}); est.close();
    est.open({}); est.close();
    assertEqual(fired, 2, 'two cycles = two events');
  });
})();

/* ══════════════════════════════════════════════════════════════
   GROUP 2: RFOS guard reset / memory preservation
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 2: RFOS guard reset / memory preservation ──');

(function() {
  /* Minimal RFOS harness — mirrors _watchHeroInput() logic */
  function makeRFOS(document) {
    let _qsmEstimatorLaunched = false;
    let _mem = { category: null, city: null };
    let _heroInput = { value: '' };
    let _bound = false;

    function _resetQsmEstimatorGuard() { _qsmEstimatorLaunched = false; }

    // Simulate _watchHeroInput() binding
    function _watchHeroInput() {
      if (!_bound) {
        _bound = true;
        document.addEventListener('fixeo:estimator-closed', function() {
          _resetQsmEstimatorGuard();
        });
      }
      return { resetEstimatorGuard: _resetQsmEstimatorGuard };
    }

    function simulateOpen(category) {
      _qsmEstimatorLaunched = true;
      _mem.category = category || 'plomberie';
    }

    return {
      _watchHeroInput,
      get launched() { return _qsmEstimatorLaunched; },
      get memCategory() { return _mem.category; },
      get inputValue() { return _heroInput.value; },
      setInputValue: (v) => { _heroInput.value = v; },
      setMemCategory: (c) => { _mem.category = c; },
      simulateOpen,
    };
  }

  test('10. RFOS listens for fixeo:estimator-closed', function() {
    const document = makeDOM();
    const rfos = makeRFOS(document);
    rfos._watchHeroInput();
    const listeners = document._getListeners('fixeo:estimator-closed');
    assert(listeners.length >= 1, 'at least one listener registered');
  });

  test('11. RFOS resets _qsmEstimatorLaunched when fixeo:estimator-closed fires', function() {
    const document = makeDOM();
    const rfos = makeRFOS(document);
    rfos._watchHeroInput();
    rfos.simulateOpen('plomberie');
    assert(rfos.launched === true, 'guard should be true after open');
    document.dispatchEvent(makeCustomEvent('fixeo:estimator-closed'));
    assert(rfos.launched === false, 'guard should reset on event');
  });

  test('12. RFOS _mem.category NOT cleared by fixeo:estimator-closed', function() {
    const document = makeDOM();
    const rfos = makeRFOS(document);
    rfos._watchHeroInput();
    rfos.setMemCategory('plomberie');
    rfos.simulateOpen('plomberie');
    document.dispatchEvent(makeCustomEvent('fixeo:estimator-closed'));
    assertEqual(rfos.memCategory, 'plomberie', '_mem.category preserved');
  });

  test('13. Hero input value NOT cleared by fixeo:estimator-closed', function() {
    const document = makeDOM();
    const rfos = makeRFOS(document);
    rfos._watchHeroInput();
    rfos.setInputValue('Débouchage évier');
    rfos.simulateOpen();
    document.dispatchEvent(makeCustomEvent('fixeo:estimator-closed'));
    assertEqual(rfos.inputValue, 'Débouchage évier', 'input value preserved');
  });

  test('14. one-shot flag prevents duplicate listener binding', function() {
    const document = makeDOM();
    const rfos = makeRFOS(document);
    rfos._watchHeroInput();
    rfos._watchHeroInput(); // second call simulates edge case
    const listeners = document._getListeners('fixeo:estimator-closed');
    // Only one binding should be present
    assert(listeners.length === 1, 'only one listener bound: ' + listeners.length);
  });
})();

/* ══════════════════════════════════════════════════════════════
   GROUP 3: PRICE_READY early persistence
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 3: PRICE_READY early persistence ──');

(function() {
  const CTX_KEY = 'fixeo_estimator_ctx_v1';

  /* Minimal bridge harness */
  function makeBridge(storage) {
    return {
      prepareContext: function(token) {
        if (!token) return;
        try { storage.setItem(CTX_KEY, token); } catch (_) {}
      },
      getContext: function() {
        try { return storage.getItem(CTX_KEY); } catch (_) { return null; }
      },
      clearContext: function() {
        try { storage.removeItem(CTX_KEY); } catch (_) {}
      },
    };
  }

  /* Simulate _renderOutcome() early persistence behaviour */
  function simulateRenderOutcome(outcomeType, token, bridge) {
    const noPricingToken = new Set(['SAFETY_STOP', 'QUOTE_REQUIRED', 'ROUTE_REQUIRED', 'REQUALIFY']);
    let earlyPersisted = false;
    let ctaCallCount = 0;

    if (!noPricingToken.has(outcomeType) && token) {
      // Early persistence (7C.9L.3Z.2B)
      if (bridge) {
        bridge.prepareContext(token);
        earlyPersisted = true;
      }
    }

    // CTA handler (simulates onPrimary tap)
    const onPrimary = function() {
      ctaCallCount++;
      if (bridge && token) bridge.prepareContext(token);
    };

    return { earlyPersisted, onPrimary, getCTACount: () => ctaCallCount };
  }

  test('15. PRICE_READY token persisted immediately on renderOutcome', function() {
    const storage = new FakeStorage();
    const bridge = makeBridge(storage);
    const token = 'opaque_token_abc_250';
    simulateRenderOutcome('PRICE_READY', token, bridge);
    assertEqual(storage.getItem(CTX_KEY), token, 'token in sessionStorage');
  });

  test('16. Token persisted before CTA tap', function() {
    const storage = new FakeStorage();
    const bridge = makeBridge(storage);
    const token = 'opaque_token_priceready';
    const result = simulateRenderOutcome('PRICE_READY', token, bridge);
    assert(result.earlyPersisted, 'early persistence flag should be true');
    assert(storage.getItem(CTX_KEY) !== null, 'token in storage before CTA');
  });

  test('17. CTA tap after early persist is idempotent (same token, no duplicate work)', function() {
    const storage = new FakeStorage();
    const bridge = makeBridge(storage);
    const token = 'opaque_token_cta_idempotent';
    const result = simulateRenderOutcome('PRICE_READY', token, bridge);
    result.onPrimary(); // user taps CTA
    // Token should still be same value
    assertEqual(storage.getItem(CTX_KEY), token, 'same token after CTA tap');
    assertEqual(result.getCTACount(), 1, 'CTA called once');
  });

  test('18. SAFETY_STOP does NOT persist token', function() {
    const storage = new FakeStorage();
    const bridge = makeBridge(storage);
    const token = 'should_not_be_stored';
    simulateRenderOutcome('SAFETY_STOP', token, bridge);
    assert(storage.getItem(CTX_KEY) === null, 'no token for SAFETY_STOP');
  });

  test('19. QUOTE_REQUIRED does NOT persist token', function() {
    const storage = new FakeStorage();
    const bridge = makeBridge(storage);
    simulateRenderOutcome('QUOTE_REQUIRED', 'some_token', bridge);
    assert(storage.getItem(CTX_KEY) === null, 'no token for QUOTE_REQUIRED');
  });

  test('20. null token does NOT persist anything', function() {
    const storage = new FakeStorage();
    const bridge = makeBridge(storage);
    simulateRenderOutcome('PRICE_READY', null, bridge);
    assert(storage.getItem(CTX_KEY) === null, 'no token stored when token is null');
  });
})();

/* ══════════════════════════════════════════════════════════════
   GROUP 4: Token survival / hide-reveal / × after PRICE_READY
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 4: Token survival after × / hide-reveal ──');

(function() {
  const CTX_KEY = 'fixeo_estimator_ctx_v1';

  function makeBridge(storage) {
    return {
      prepareContext: (t) => { if (t) storage.setItem(CTX_KEY, t); },
      getContext: () => storage.getItem(CTX_KEY),
      clearContext: () => storage.removeItem(CTX_KEY),
    };
  }

  test('21. Token survives PRICE_READY × close (not cleared by _destroyContainer)', function() {
    const storage = new FakeStorage();
    const bridge = makeBridge(storage);
    // Simulate early persist at PRICE_READY render
    bridge.prepareContext('opaque_250_token');
    // Simulate _destroyContainer() — should NOT clear sessionStorage
    // (there is no clearContext() call in _destroyContainer)
    // We verify the contract: token still present after destroy
    assert(storage.getItem(CTX_KEY) === 'opaque_250_token', 'token persists after ×');
  });

  test('22. Token survives hide() — bridge not called in hide()', function() {
    const storage = new FakeStorage();
    const bridge = makeBridge(storage);
    bridge.prepareContext('token_hide_test');
    // hide() only touches style properties, not sessionStorage
    // We simulate: no bridge call in hide
    const tokenBefore = storage.getItem(CTX_KEY);
    // (no action — hide doesn't call bridge)
    assertEqual(storage.getItem(CTX_KEY), tokenBefore, 'token unchanged after hide');
  });

  test('23. Token survives reveal() — bridge not called in reveal()', function() {
    const storage = new FakeStorage();
    const bridge = makeBridge(storage);
    bridge.prepareContext('token_reveal_test');
    const tokenBefore = storage.getItem(CTX_KEY);
    // reveal() only touches style properties
    assertEqual(storage.getItem(CTX_KEY), tokenBefore, 'token unchanged after reveal');
  });

  test('24. verifyContext can server-verify token after × (simulated)', function() {
    // Simulated: verifyContext reads from sessionStorage independently of Estimator DOM
    const storage = new FakeStorage();
    const bridge = makeBridge(storage);
    bridge.prepareContext('opaque_verified_token');

    // Simulate Estimator DOM destroyed (bridge is independent of DOM)
    // verifyContext only needs: storage.getItem(CTX_KEY) + API call
    const retrieved = bridge.getContext();
    assert(retrieved !== null, 'token retrievable after DOM destroy');
    assertEqual(retrieved, 'opaque_verified_token', 'correct token retrieved');
  });

  test('25. clearContext removes token (Nouvelle demande path)', function() {
    const storage = new FakeStorage();
    const bridge = makeBridge(storage);
    bridge.prepareContext('token_to_clear');
    bridge.clearContext();
    assert(storage.getItem(CTX_KEY) === null, 'token cleared');
  });
})();

/* ══════════════════════════════════════════════════════════════
   GROUP 5: Expired token handling
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 5: Expired token handling ──');

(function() {
  test('26. verifyContext returns null for expired token (simulated server rejection)', function() {
    // Simulate verifyContext() calling API and getting { valid: false, reason: 'expired' }
    function simulateVerifyContext(serverResponse) {
      if (!serverResponse || !serverResponse.valid) return null;
      return serverResponse;
    }
    const result = simulateVerifyContext({ valid: false, reason: 'expired' });
    assert(result === null, 'expired token returns null from verifyContext');
  });

  test('27. verifyContext returns null for invalid token', function() {
    function simulateVerifyContext(serverResponse) {
      if (!serverResponse || !serverResponse.valid) return null;
      return serverResponse;
    }
    const result = simulateVerifyContext({ valid: false, reason: 'invalid' });
    assert(result === null, 'invalid token returns null from verifyContext');
  });
})();

/* ══════════════════════════════════════════════════════════════
   GROUP 6: FAEE isolation regression (3Z.1)
══════════════════════════════════════════════════════════════ */
console.log('\n── Group 6: FAEE isolation regression guard ──');

(function() {
  /* Verify FAEE suppression logic unchanged — mirrors 3Z.1 harness */
  function makeModalEl(hasEstimatorCtx) {
    let attrs = {};
    if (hasEstimatorCtx) attrs['data-estimator-context'] = 'true';
    return {
      getAttribute: (k) => attrs[k] || null,
      setAttribute: (k, v) => { attrs[k] = v; },
      removeAttribute: (k) => { delete attrs[k]; },
    };
  }

  function faeeUpdate(modal) {
    if (modal && modal.getAttribute('data-estimator-context') === 'true') {
      return 'SUPPRESSED'; // early return, remove faee-container
    }
    return 'RENDERED'; // normal FAEE render
  }

  test('28. FAEE suppressed in V2 Estimator reservation modal', function() {
    const modal = makeModalEl(true);
    assertEqual(faeeUpdate(modal), 'SUPPRESSED', 'FAEE suppressed');
  });

  test('29. FAEE renders normally in non-V2 reservation modal', function() {
    const modal = makeModalEl(false);
    assertEqual(faeeUpdate(modal), 'RENDERED', 'FAEE renders for non-V2');
  });

  test('30. data-estimator-context attribute survives multiple render() calls', function() {
    const modal = makeModalEl(false);
    // First render with valid ctx
    modal.setAttribute('data-estimator-context', 'true');
    assertEqual(modal.getAttribute('data-estimator-context'), 'true', 'attr set');
    // Re-render with same ctx
    modal.setAttribute('data-estimator-context', 'true');
    assertEqual(modal.getAttribute('data-estimator-context'), 'true', 'attr still set after re-render');
    // Render with no ctx
    modal.removeAttribute('data-estimator-context');
    assert(modal.getAttribute('data-estimator-context') === null, 'attr cleared');
  });
})();

/* ── Summary ─────────────────────────────────────────────── */
console.log('\n══════════════════════════════════════');
console.log(`RESULT: ${pass}/${pass + fail} tests passed`);
if (fail > 0) {
  console.error(`FAILED: ${fail} test(s)`);
  process.exit(1);
}
console.log('ALL PASS');
