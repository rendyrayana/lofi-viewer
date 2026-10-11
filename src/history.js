import { store } from './store.js';

// Settings history for undo/redo. Every store key is tracked except transient
// state; rapid changes (a slider drag, a preset setting many keys) are grouped
// into one step.
const UNTRACKED = new Set([
  'activeTab', 'inverted', 'filename', 'filesize', 'tris', 'fps',
  'procStats', 'procBusy', 'loadBusy', 'loadMs',
  'printPreview', 'printPreviewInfo', 'compare', 'compareSplit', 'turntable',
]);
const GROUP_MS = 400;
const LIMIT = 100;

const tracked = () => Object.keys(store.state).filter(k => !UNTRACKED.has(k));
const clone = v => (Array.isArray(v) ? [...v] : v);
const snapshot = () => Object.fromEntries(tracked().map(k => [k, clone(store.get(k))]));
const same = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => v === b[i]) : a === b);

let past = [], future = [], current = snapshot();
let applying = false, inBurst = false, timer = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn({ canUndo: past.length > 0, canRedo: future.length > 0 }));

store.subscribe('*', key => {
  if (applying || UNTRACKED.has(key)) return;
  if (!inBurst) {
    if (same(current[key], store.get(key))) return;
    past.push(current);
    if (past.length > LIMIT) past.shift();
    future = [];
    inBurst = true;
    notify();
  }
  clearTimeout(timer);
  timer = setTimeout(endBurst, GROUP_MS);
});

function endBurst() {
  clearTimeout(timer);
  inBurst = false;
  current = snapshot();
}

let onApply = null;

function apply(state) {
  const changes = {};
  for (const [k, v] of Object.entries(state)) if (!same(store.get(k), v)) changes[k] = clone(v);
  applying = true;
  try { store.setMany(changes); } finally { applying = false; }
  current = snapshot();
  onApply?.(changes);
  notify();
}

export function undo() {
  if (inBurst) endBurst();
  if (!past.length) return;
  future.push(current);
  apply(past.pop());
}

export function redo() {
  if (inBurst) endBurst();
  if (!future.length) return;
  past.push(current);
  apply(future.pop());
}

export function onHistoryChange(fn) {
  listeners.add(fn);
  fn({ canUndo: past.length > 0, canRedo: future.length > 0 });
  return () => listeners.delete(fn);
}

// Called after undo/redo restores settings, e.g. to rebuild the open panel.
export function setHistoryApplyHandler(fn) { onApply = fn; }
