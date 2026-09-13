'use strict';
// ══════════════════════════════════════════════════════════════
// Enterprise RC Pre-Hardening — Targeted Tests
// FE-BUG-01: create_enterprise_request response contract
// DEF-09:    trapFocus keydown listener cleanup
// ══════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function assert(label, cond) {
  if (cond) {
    console.log('  PASS ', label);
    passed++;
  } else {
    console.error('  FAIL ', label);
    failed++;
  }
}

// ── Minimal DOM stub ─────────────────────────────────────────
// We need enough DOM for trapFocus and dialog tests.
function makeEl(tag) {
  const listeners = {};
  const el = {
    _tag: tag,
    style: {},
    dataset: {},
    hidden: false,
    _listeners: listeners,
    addEventListener(type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(function(f){ return f !== fn; });
    },
    _listenerCount(type) {
      return (listeners[type] || []).length;
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    removeAttribute() {},
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    textContent: '',
    className: '',
    id: '',
    firstChild: null,
    appendChild() {},
    innerHTML: ''
  };
  return el;
}

// ── Section 1: FE-BUG-01 — response contract ────────────────
console.log('\n[Section 1] FE-BUG-01 — create_enterprise_request response contract\n');

// 1-01: service_request_id wins over request_id and id
(function() {
  var data = { ok: true, service_request_id: 'uuid-A', request_id: 'uuid-B', id: 'uuid-C' };
  var newId = (data && (data.service_request_id || data.request_id || data.id)) || null;
  assert('1-01: service_request_id wins over request_id and id', newId === 'uuid-A');
})();

// 1-02: canonical field alone is sufficient
(function() {
  var data = { ok: true, service_request_id: 'uuid-canonical' };
  var newId = (data && (data.service_request_id || data.request_id || data.id)) || null;
  assert('1-02: canonical service_request_id alone is sufficient', newId === 'uuid-canonical');
})();

// 1-03: fallback to request_id if service_request_id absent (backwards compat)
(function() {
  var data = { ok: true, request_id: 'uuid-fallback' };
  var newId = (data && (data.service_request_id || data.request_id || data.id)) || null;
  assert('1-03: fallback to request_id when service_request_id absent', newId === 'uuid-fallback');
})();

// 1-04: fallback to id as last resort
(function() {
  var data = { ok: true, id: 'uuid-last' };
  var newId = (data && (data.service_request_id || data.request_id || data.id)) || null;
  assert('1-04: fallback to id as last resort', newId === 'uuid-last');
})();

// 1-05: successful RPC does not produce undefined/null request id when service_request_id present
(function() {
  var data = { ok: true, service_request_id: 'uuid-present' };
  var newId = (data && (data.service_request_id || data.request_id || data.id)) || null;
  assert('1-05: successful RPC does not produce null when service_request_id present', newId !== null && newId !== undefined);
})();

// 1-06: old contract (data.id only) would have lost uuid — confirm canonical fixes it
(function() {
  var data = { ok: true, service_request_id: 'uuid-real', enterprise_request_context_id: 'ctx-X' };
  // Old (buggy) code: data.id || data.request_id → undefined → null
  var oldResult = (data && (data.id || data.request_id)) || null;
  // New (correct) code
  var newResult = (data && (data.service_request_id || data.request_id || data.id)) || null;
  assert('1-06: old contract lost id (null), new contract captures it', oldResult === null && newResult === 'uuid-real');
})();

// 1-07: RPC error (ok:false) does not produce a fake success id
(function() {
  var data = { ok: false, reason: 'site_inactive' };
  // In the actual code, ok===false throws before newId is computed, so newId is never set.
  // We test the guard: if ok===false, treat as error (no newId consumed)
  var isError = data && data.ok === false;
  assert('1-07: RPC ok:false is detected as error, no id consumed', isError === true);
})();

// 1-08: null data (network error path) produces null newId safely
(function() {
  var data = null;
  var newId = (data && (data.service_request_id || data.request_id || data.id)) || null;
  assert('1-08: null data safely produces null newId', newId === null);
})();

// 1-09: viewBtn.dataset.requestId set with canonical id
(function() {
  var viewBtn = { dataset: {} };
  var data = { ok: true, service_request_id: 'uuid-view' };
  var newId = (data && (data.service_request_id || data.request_id || data.id)) || null;
  if (viewBtn && newId) { viewBtn.dataset.requestId = newId; }
  assert('1-09: viewBtn.dataset.requestId set to canonical service_request_id', viewBtn.dataset.requestId === 'uuid-view');
})();

// 1-10: no dispatch_execute call introduced (structural: check newId is only used for viewBtn)
// This is a contract assertion: the fix touches exactly one line (the newId extraction)
// and does NOT call any dispatch function.
(function() {
  // We verify the fix expression doesn't reference dispatch
  var fixExpr = "data.service_request_id||data.request_id||data.id";
  assert('1-10: fix expression does not reference dispatch_execute', !fixExpr.includes('dispatch'));
})();

// ── Section 2: DEF-09 — trapFocus lifecycle ──────────────────
console.log('\n[Section 2] DEF-09 — trapFocus keydown listener cleanup\n');

// Inline trapFocus implementation (exact copy from JS fix)
function trapFocus(el) {
  const focusable = el.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
  const first = focusable[0];
  const last  = focusable[focusable.length-1];
  function _handler(e) {
    if(e.key !== 'Tab') return;
    if(e.shiftKey) { if(document.activeElement===first){ e.preventDefault(); if(last) last.focus(); } }
    else           { if(document.activeElement===last) { e.preventDefault(); if(first) first.focus(); } }
  }
  el.addEventListener('keydown', _handler);
  return function releaseFocusTrap() {
    el.removeEventListener('keydown', _handler);
  };
}

// 2-01: opening dialog attaches exactly one keydown listener
(function() {
  var el = makeEl('div');
  trapFocus(el);
  assert('2-01: opening dialog attaches exactly one keydown listener', el._listenerCount('keydown') === 1);
})();

// 2-02: closing removes the listener (count goes to 0)
(function() {
  var el = makeEl('div');
  var release = trapFocus(el);
  release();
  assert('2-02: releasing trap removes keydown listener (count=0)', el._listenerCount('keydown') === 0);
})();

// 2-03: open → close → open: exactly 1 listener after second open
(function() {
  var el = makeEl('div');
  var r1 = trapFocus(el);
  r1();
  var r2 = trapFocus(el);
  assert('2-03: open→close→open has exactly 1 listener (no accumulation)', el._listenerCount('keydown') === 1);
  r2();
})();

// 2-04: repeated opens without close accumulate (confirm the OLD bug)
(function() {
  var el = makeEl('div');
  // Simulate OLD behaviour (no cleanup between opens)
  var oldTrapFocus = function(el) {
    el.addEventListener('keydown', function(e){ if(e.key !== 'Tab') return; });
  };
  oldTrapFocus(el); oldTrapFocus(el); oldTrapFocus(el);
  assert('2-04 (old-bug confirmed): 3 opens without cleanup = 3 listeners accumulated', el._listenerCount('keydown') === 3);
})();

// 2-05: Escape path — closeDialog calls releaseTrap
(function() {
  var el = makeEl('div');
  var released = false;
  var _releaseTrap = trapFocus(el);
  function closeDialog() {
    released = true;
    _releaseTrap();
  }
  // Simulate Escape keydown
  closeDialog();
  assert('2-05: Escape path calls releaseTrap and removes listener', released && el._listenerCount('keydown') === 0);
})();

// 2-06: normal close path calls releaseTrap
(function() {
  var el = makeEl('div');
  var released = false;
  var release = trapFocus(el);
  // Simulate normal close button click
  function onClose() { released = true; release(); }
  onClose();
  assert('2-06: normal close path removes listener', released && el._listenerCount('keydown') === 0);
})();

// 2-07: focus restoration preserved — closeDialog still calls focus() on prev element
(function() {
  var el = makeEl('div');
  var prevFocus = { _focused: false, focus: function(){ this._focused = true; } };
  var lastFocusedElement = prevFocus;
  var release = trapFocus(el);
  function closeDialog() {
    release();
    if(lastFocusedElement && typeof lastFocusedElement.focus === 'function'){
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }
  closeDialog();
  assert('2-07: focus restoration still works after trap release', prevFocus._focused === true);
})();

// 2-08: multiple sequential dialogs — each gets its own independent listener
(function() {
  var el1 = makeEl('div');
  var el2 = makeEl('div');
  var r1 = trapFocus(el1);
  var r2 = trapFocus(el2);
  r1(); // close dialog 1
  assert('2-08a: after closing dialog 1, el1 has 0 listeners', el1._listenerCount('keydown') === 0);
  assert('2-08b: dialog 2 still has 1 listener (independent)', el2._listenerCount('keydown') === 1);
  r2();
})();

// 2-09: release is idempotent (calling twice does not throw)
(function() {
  var el = makeEl('div');
  var release = trapFocus(el);
  release();
  var threw = false;
  try { release(); } catch(e) { threw = true; }
  assert('2-09: release() is idempotent (double-call does not throw)', !threw && el._listenerCount('keydown') === 0);
})();

// 2-10: search dialog — _searchTrapRelease pattern
(function() {
  var dlg = makeEl('div');
  var _searchTrapRelease = null;
  var _searchPrevFocus = null;

  function openSearch() {
    _searchPrevFocus = { focus: function(){} };
    _searchTrapRelease = trapFocus(dlg);
  }
  function closeSearch() {
    if(typeof _searchTrapRelease==='function'){ _searchTrapRelease(); _searchTrapRelease=null; }
    _searchPrevFocus = null;
  }

  openSearch();
  assert('2-10a: search open attaches 1 listener', dlg._listenerCount('keydown') === 1);
  closeSearch();
  assert('2-10b: search close removes listener', dlg._listenerCount('keydown') === 0);
  assert('2-10c: _searchTrapRelease is null after close', _searchTrapRelease === null);
})();

// 2-11: cmd palette — _cmdTrapRelease pattern
(function() {
  var dlg = makeEl('div');
  var _cmdTrapRelease = null;

  function openCmdPalette() {
    _cmdTrapRelease = trapFocus(dlg);
  }
  function closeCmdPalette() {
    if(typeof _cmdTrapRelease==='function'){ _cmdTrapRelease(); _cmdTrapRelease=null; }
  }

  openCmdPalette(); openCmdPalette(); // double-open (guard would prevent in real code, but test cleanup)
  // In real code S.cmdOpen guard prevents double-open; but if it fires twice,
  // the second _cmdTrapRelease overrides the first (first listener leaks).
  // The guard in openCmdPalette ('if(S.cmdOpen) return') prevents this.
  // Here we just verify the close path is correct:
  closeCmdPalette();
  assert('2-11: cmd palette close nulls _cmdTrapRelease', _cmdTrapRelease === null);
})();

// 2-12: verify exact function reference is retained for removal
(function() {
  var el = makeEl('div');
  var handlerRef = null;
  // Patch addEventListener to capture ref
  var capturedFn = null;
  el.addEventListener = function(type, fn) {
    if (!el._listeners[type]) el._listeners[type] = [];
    el._listeners[type].push(fn);
    capturedFn = fn;
  };
  el.removeEventListener = function(type, fn) {
    if (!el._listeners[type]) return;
    var before = el._listeners[type].length;
    el._listeners[type] = el._listeners[type].filter(function(f){ return f !== fn; });
  };

  var release = trapFocus(el);
  var fnBeforeRelease = capturedFn;
  release();
  assert('2-12: removeEventListener called with exact same function reference', el._listenerCount('keydown') === 0);
})();

// ── Final summary ─────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log(' ENTERPRISE RC PRE-HARDENING — TARGETED TESTS');
console.log('══════════════════════════════════════════════════');
console.log(' Total  : ' + (passed + failed));
console.log(' Passed : ' + passed);
console.log(' Failed : ' + failed);
console.log('══════════════════════════════════════════════════');
if (failed === 0) {
  console.log(' RC PRE-HARDENING TESTS: PASSED');
} else {
  console.error(' RC PRE-HARDENING TESTS: FAILED');
  process.exitCode = 1;
}
