import { analyzeModel, normalizeDump } from './model.js';
import { analyze } from './analysis.js';
import { diffDumps } from './diff.js';
import { applyTheme } from './theme.js';
import { clearDump, loadDump, readPrefs, saveDump, writePrefs } from './storage.js';

export const VIEWS = ['overview', 'findings', 'mods', 'plugins', 'environment', 'raw', 'compare'];

export const state = {
  view: 'overview',
  params: {},
  model: null,
  analysis: null,
  reference: null,
  referenceAnalysis: null,
  diff: null,
  stored: { current: null, reference: null },
  loading: null,
  busy: false,
  error: null,
  toasts: [],
  prefs: readPrefs(),
  themeMenuOpen: false
};

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit() {
  for (const listener of listeners) listener(state);
}

export function setState(patch) {
  Object.assign(state, patch);
  emit();
}

export function toast(message, tone = 'neutral') {
  const id = Math.random().toString(36).slice(2);
  state.toasts = [...state.toasts, { id, message, tone }];
  emit();
  window.setTimeout(() => {
    state.toasts = state.toasts.filter((entry) => entry.id !== id);
    emit();
  }, 5200);
  return id;
}

export function dismissToast(id) {
  state.toasts = state.toasts.filter((entry) => entry.id !== id);
  emit();
}

export function parseHash(hash = window.location.hash) {
  const clean = hash.replace(/^#\/?/, '');
  const [path, query] = clean.split('?');
  const view = VIEWS.includes(path) ? path : 'overview';
  const params = {};
  new URLSearchParams(query || '').forEach((value, key) => {
    if (value !== '') params[key] = value;
  });
  return { view, params };
}

export function buildHash(view, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `#/${view}${query ? `?${query}` : ''}`;
}

export function navigate(view, params = {}, { replace = false, merge = false } = {}) {
  const nextParams = merge ? { ...state.params, ...params } : params;
  const hash = buildHash(view, nextParams);
  if (replace) window.history.replaceState(null, '', hash);
  else window.location.hash = hash;
  syncFromHash();
}

export function patchParams(patch, options = {}) {
  navigate(state.view, { ...state.params, ...patch }, { replace: true, ...options });
}

function syncFromHash() {
  const { view, params } = parseHash();
  state.view = view;
  state.params = params;
  if (state.prefs.view !== view) {
    state.prefs = { ...state.prefs, view };
    writePrefs(state.prefs);
  }
  emit();
}

export async function boot() {
  applyTheme({ mode: state.prefs.mode, contrast: state.prefs.contrast });
  window.addEventListener('hashchange', syncFromHash);
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (state.prefs.mode === 'system') applyTheme({ mode: 'system', contrast: state.prefs.contrast });
  });
  const initial = parseHash();
  state.view = state.prefs.view && !window.location.hash ? state.prefs.view : initial.view;
  state.params = initial.params;
  if (!window.location.hash) window.history.replaceState(null, '', buildHash(state.view));
  emit();
  const [storedCurrent, storedReference] = await Promise.all([loadDump('current'), loadDump('reference')]);
  state.stored = {
    current: storedCurrent ? { name: storedCurrent.name, at: storedCurrent.at, size: storedCurrent.size } : null,
    reference: storedReference ? { name: storedReference.name, at: storedReference.at, size: storedReference.size } : null
  };
  emit();
  return { storedCurrent, storedReference };
}

export function setPrefs(patch) {
  state.prefs = { ...state.prefs, ...patch };
  writePrefs(state.prefs);
  applyTheme({ mode: state.prefs.mode, contrast: state.prefs.contrast });
  emit();
}

function describeJsonError(error, text) {
  const message = String(error?.message || error);
  const position = message.match(/position (\d+)/);
  if (!position) return message;
  const index = Number(position[1]);
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  const column = index - before.lastIndexOf('\n');
  const snippet = text.slice(Math.max(0, index - 40), index + 40).replace(/\s+/g, ' ').trim();
  return `${message.split(' in JSON')[0]} — line ${line}, column ${column}${snippet ? `, near “${snippet}”` : ''}`;
}

function analyzeText(text, fileName) {
  const clean = text.replace(/^\uFEFF/, '');
  let raw;
  try {
    raw = JSON.parse(clean);
  } catch (error) {
    throw new Error(`${fileName} is not valid JSON: ${describeJsonError(error, clean)}`);
  }
  const model = analyzeModel(normalizeDump(raw, fileName));
  const analysis = analyze(model);
  return { model, analysis };
}

function nextPaint() {
  return Promise.race([
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    new Promise((resolve) => setTimeout(resolve, 240))
  ]);
}

export async function loadText(text, fileName, { role = 'current', persist = true } = {}) {
  setState({ busy: true, loading: { name: fileName, role } });
  await nextPaint();
  try {
    const { model, analysis } = analyzeText(text, fileName);
    if (role === 'reference') {
      state.reference = model;
      state.referenceAnalysis = analysis;
      state.diff = state.model ? diffDumps(model, state.model, analysis, state.analysis) : null;
      if (persist) {
        saveDump('reference', { name: fileName, text, at: Date.now(), size: text.length });
        state.stored = { ...state.stored, reference: { name: fileName, at: Date.now(), size: text.length } };
      }
      toast(`Reference set to ${fileName}`, 'info');
    } else {
      const previousReference = state.reference ? { model: state.reference, analysis: state.referenceAnalysis } : null;
      state.model = model;
      state.analysis = analysis;
      state.diff = previousReference ? diffDumps(previousReference.model, model, previousReference.analysis, analysis) : null;
      state.error = null;
      if (persist) saveDump('current', { name: fileName, text, at: Date.now(), size: text.length });
      state.stored = { ...state.stored, current: persist ? { name: fileName, at: Date.now(), size: text.length } : state.stored.current };
    }
    setState({ busy: false, loading: null });
    return true;
  } catch (error) {
    setState({ busy: false, loading: null, error: { message: String(error.message || error), fileName, role } });
    toast(String(error.message || error), 'critical');
    return false;
  }
}

export async function loadFile(file, role = 'current') {
  if (!file) return false;
  if (file.size > 80 * 1024 * 1024) {
    toast(`${file.name} is too large to read here (over 80 MB)`, 'critical');
    return false;
  }
  let text;
  try {
    text = await file.text();
  } catch {
    toast(`Could not read ${file.name}`, 'critical');
    return false;
  }
  return loadText(text, file.name, { role });
}

export async function loadFiles(files) {
  const list = [...files].filter(Boolean);
  if (!list.length) return;
  if (list.length === 1) {
    navigate('overview');
    const loaded = await loadFile(list[0], 'current');
    if (loaded) setState({ reference: null, referenceAnalysis: null, diff: null });
    return;
  }

  navigate('overview');
  setState({ reference: null, referenceAnalysis: null, diff: null });
  const first = await loadFile(list[0], 'current');
  if (!first) return;
  const second = await loadFile(list[1], 'reference');
  if (second) navigate('compare');
}

export async function restoreStored(role = 'current') {
  const payload = await loadDump(role);
  if (!payload) {
    toast('Nothing stored to restore', 'warning');
    return false;
  }
  return loadText(payload.text, role === 'reference' ? payload.name : payload.name, { role, persist: false });
}

export function unload({ role = 'current' } = {}) {
  if (role === 'reference') {
    setState({ reference: null, referenceAnalysis: null, diff: null });
    clearDump('reference');
    state.stored = { ...state.stored, reference: null };
    toast('Reference dump removed');
  } else {
    setState({ model: null, analysis: null, error: null });
    clearDump('current');
    state.stored = { ...state.stored, current: null };
  }
  emit();
}

export function swapDumps() {
  if (!state.model || !state.reference) return;
  const model = state.model;
  const analysis = state.analysis;
  state.model = state.reference;
  state.analysis = state.referenceAnalysis;
  state.reference = model;
  state.referenceAnalysis = analysis;
  state.diff = diffDumps(state.reference, state.model, state.referenceAnalysis, state.analysis);
  emit();
}
