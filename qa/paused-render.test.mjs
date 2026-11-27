import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPausedRenderGate,
  bindPausedRenderInvalidation,
} from '../paused-render.js';

const paused = (gate, options = {}) => gate.shouldRender({status: 'paused', key: 'steady', ...options});

class FakeTarget {
  listeners = new Map();
  addEventListener(type, callback, options) {
    const entries = this.listeners.get(type) ?? [];
    entries.push({callback, options});
    this.listeners.set(type, entries);
  }
  removeEventListener(type, callback, options) {
    const entries = this.listeners.get(type) ?? [];
    this.listeners.set(type, entries.filter(entry => entry.callback !== callback || entry.options !== options));
  }
  dispatch(type, event = {}) {
    for (const {callback} of this.listeners.get(type) ?? []) callback(event);
  }
  listenerCount() {
    return [...this.listeners.values()].reduce((sum, entries) => sum + entries.length, 0);
  }
}

class FakeMutationObserver {
  static instances = [];
  constructor(callback) {
    this.callback = callback;
    this.observed = [];
    this.disconnected = false;
    FakeMutationObserver.instances.push(this);
  }
  observe(target, options) { this.observed.push({target, options}); }
  disconnect() { this.disconnected = true; }
}

function boundFixture() {
  FakeMutationObserver.instances = [];
  const gate = createPausedRenderGate();
  const win = new FakeTarget();
  const doc = new FakeTarget();
  const canvas = new FakeTarget();
  const overlay = {};
  const dialog = {};
  const media = new FakeTarget();
  win.matchMedia = query => {
    assert.equal(query, '(prefers-reduced-motion: reduce)');
    return media;
  };
  win.MutationObserver = FakeMutationObserver;
  const detach = bindPausedRenderInvalidation({gate, win, doc, canvas, overlay, dialog});
  const observer = FakeMutationObserver.instances[0];
  const steadyDraw = () => paused(gate);
  assert.equal(steadyDraw(), true, 'initial paused frame is drawn');
  assert.equal(steadyDraw(), false, 'clean steady-state paused frame is skipped');
  return {gate, win, doc, canvas, overlay, dialog, media, observer, detach, steadyDraw};
}

test('paused render gate draws first frame, skips steady state, and reacts to invalidation/status/dirty/key', () => {
  const gate = createPausedRenderGate();
  assert.equal(paused(gate), true, 'first paused draw is required');
  assert.equal(paused(gate), false, 'unchanged paused frame is skipped');
  assert.equal(paused(gate, {dirty: true}), true, 'dirty state redraws');
  assert.equal(paused(gate), false, 'dirty draw returns to steady state');

  gate.invalidate();
  assert.equal(paused(gate), true, 'explicit invalidation redraws');
  assert.equal(paused(gate), false);
  assert.equal(paused(gate, {key: 'camera-or-size-changed'}), true, 'render key change redraws');
  assert.equal(paused(gate), true, 'paused status transition redraws');
  assert.equal(paused(gate), false);

  assert.equal(gate.shouldRender({status: 'running', key: 'steady'}), true);
  assert.equal(gate.shouldRender({status: 'running', key: 'steady'}), true, 'every non-paused frame draws');
  assert.equal(paused(gate), true, 'transition back to paused draws once');
  assert.equal(paused(gate), false);
});

test('window, document, canvas, media-query, and observed DOM changes invalidate paused rendering', () => {
  const f = boundFixture();
  const groups = [
    [f.win, ['resize', 'focus', 'blur', 'pageshow']],
    [f.doc, ['visibilitychange', 'fullscreenchange', 'input', 'change', 'click', 'keydown', 'focusin']],
    [f.canvas, ['webglcontextlost', 'webglcontextrestored']],
  ];
  for (const [target, types] of groups) {
    for (const type of types) {
      assert.ok(target.listeners.get(type)?.some(entry => entry.options === true), `${type} uses capture listener`);
      target.dispatch(type);
      assert.equal(f.steadyDraw(), true, `${type} invalidates`);
      assert.equal(f.steadyDraw(), false, `${type} invalidation is consumed once`);
    }
  }
  for (const type of ['pointerdown', 'pointerup']) {
    assert.equal(f.doc.listeners.get(type), undefined, `${type} does not add a redundant invalidation listener`);
    f.doc.dispatch(type);
    assert.equal(f.steadyDraw(), false, `${type} alone does not invalidate`);
  }

  f.media.dispatch('change');
  assert.equal(f.steadyDraw(), true, 'reduced-motion preference change invalidates');
  assert.equal(f.steadyDraw(), false);

  assert.equal(f.observer.observed.length, 2, 'overlay and dialog are observed');
  for (const entry of f.observer.observed) {
    assert.ok([f.overlay, f.dialog].includes(entry.target));
    assert.deepEqual(entry.options, {subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true});
  }
  const attr = {getAttribute: () => 'same'};
  f.observer.callback([{type: 'attributes', target: attr, attributeName: 'class', oldValue: 'same'}]);
  assert.equal(f.steadyDraw(), false, 'no-op attribute record does not redraw');
  f.observer.callback([{type: 'attributes', target: {getAttribute: () => 'new'}, attributeName: 'class', oldValue: 'old'}]);
  assert.equal(f.steadyDraw(), true, 'changed attribute redraws');
  assert.equal(f.steadyDraw(), false);
  f.observer.callback([{type: 'childList'}]);
  assert.equal(f.steadyDraw(), true, 'child-list changes redraw');
});

test('detach removes event and media listeners and disconnects the mutation observer', () => {
  const f = boundFixture();
  f.detach();
  assert.equal(f.win.listenerCount(), 0);
  assert.equal(f.doc.listenerCount(), 0);
  assert.equal(f.canvas.listenerCount(), 0);
  assert.equal(f.media.listenerCount(), 0);
  assert.equal(f.observer.disconnected, true);

  f.win.dispatch('resize');
  f.doc.dispatch('visibilitychange');
  f.canvas.dispatch('webglcontextrestored');
  f.media.dispatch('change');
  assert.equal(f.steadyDraw(), false, 'detached invalidation sources no longer request frames');
});
