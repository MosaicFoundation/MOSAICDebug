import './material.js';
import { state, boot, buildHash, loadFile, loadFiles, navigate, patchParams, restoreStored, subscribe, swapDumps, toast, unload, dismissToast } from './store.js';
import { buildReport, reportFileName } from './report.js';
import { parseList, toggleInList } from './filters.js';
import { esc, icon } from './ui/pieces.js';
import { initShell, renderShell, toggleDrawer, closeDrawer, openThemeMenu, openReportMenu, focusSearch, closeMenus } from './ui/shell.js';
import { renderOverview } from './ui/overview.js';
import { renderFindings } from './ui/findings.js';
import { renderLibrary } from './ui/library.js';
import { renderEnvironment } from './ui/environment.js';
import { renderCssEditor } from './ui/css-editor.js';
import { renderRaw } from './ui/raw.js';
import { renderCompare } from './ui/compare.js';
import { environmentText, findingText, openHelpDialog, openModDialog, openPluginDialog, openOtherFileDialog, openCharacterDialog, openReportDialog } from './ui/dialogs.js';

const main = document.getElementById('main');
const fileInput = document.getElementById('file-input');
let pendingRole = 'current';
let searchTimer = null;
let lastView = state.view;

const VIEW_RENDERERS = {
  overview: renderOverview,
  findings: renderFindings,
  mods: (current) => renderLibrary(current, 'mods'),
  plugins: (current) => renderLibrary(current, 'plugins'),
  environment: renderEnvironment,
  'css-editor': renderCssEditor,
  raw: renderRaw,
  compare: renderCompare
};

function captureFocus() {
  const active = document.activeElement;
  if (!active?.dataset?.control) return null;
  let start = null;
  let end = null;
  try {
    const input = active.shadowRoot?.querySelector('input, textarea');
    if (input) {
      start = input.selectionStart;
      end = input.selectionEnd;
    }
  } catch {
    start = null;
  }
  return { control: active.dataset.control, start, end };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const target = main.querySelector(`[data-control="${snapshot.control}"]`);
  if (!target) return;
  target.focus();
  try {
    const input = target.shadowRoot?.querySelector('input, textarea');
    if (input && snapshot.start !== null) input.setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start);
  } catch {
    return;
  }
}

const scrollPositions = new Map();

function render() {
  document.body.classList.toggle('is-empty', !state.model);
  const viewChanged = state.view !== lastView;
  if (viewChanged) scrollPositions.set(lastView, window.scrollY);
  const focus = captureFocus();
  const scroll = viewChanged ? scrollPositions.get(state.view) || 0 : window.scrollY;

  renderShell(state);
  main.innerHTML = renderMain();
  syncControls();

  restoreFocus(focus);
  if (scroll) window.scrollTo({ top: scroll, behavior: 'auto' });
  else if (viewChanged) window.scrollTo({ top: 0, behavior: 'auto' });
  main.classList.toggle('is-first', !state.model);
  lastView = state.view;
}

function syncControls() {
  for (const control of main.querySelectorAll('[data-control]')) {
    const name = control.dataset.control;
    if (name === 'q') {
      const value = state.params.q || '';
      if (control.value !== value) control.value = value;
    }
  }
}

function renderMain() {
  if (state.loading) return renderScanning();
  if (state.error && !state.model) return renderError();
  if (!state.model) return renderWelcome();
  const renderer = VIEW_RENDERERS[state.view] || VIEW_RENDERERS.overview;
  return renderer(state);
}

function renderScanning() {
  return `<div class="scanning">
    ${icon('troubleshoot', 'scanning__icon')}
    <h1 class="scanning__title">Reading ${esc(state.loading.name)}</h1>
    <p class="scanning__body">Parsing the file, indexing the inventory and running every check.</p>
    <div class="skeleton scanning__skeleton">${Array.from({ length: 6 }).map(() => '<span class="skeleton__row"></span>').join('')}</div>
  </div>`;
}

function renderError() {
  const { error } = state;
  return `<div class="view view--error">
    <div class="error-card">
      <span class="error-card__badge">${icon('report')}Could not read the file</span>
      <h1 class="error-card__title">${esc(error.fileName)}</h1>
      <p class="error-card__message">${esc(error.message)}</p>
      <div class="error-card__help">
        <h2 class="block__title">What usually causes this</h2>
        <ul class="help__list">
          <li>The dump was still being written when it was copied: regenerate it and try again.</li>
          <li>The file was opened as text and saved back with extra characters before the first brace.</li>
          <li>It is a different JSON file, not a Mosaic debug dump.</li>
        </ul>
      </div>
      <div class="error-card__actions">
        <md-filled-button data-action="open-dump">${icon('folder_open')}Choose another file</md-filled-button>
        <md-text-button data-action="dismiss-error">${icon('close')}Dismiss</md-text-button>
      </div>
    </div>
  </div>`;
}

function renderWelcome() {
  return `<div class="view view--welcome">
    <div class="welcome">
      <div class="welcome__main">
        <span class="brand__mark brand__mark--welcome">
          <img class="brand__logo brand__logo--on-dark" src="assets/images/logobig.png" alt="MOSAIC Debug" width="1580" height="171" decoding="async">
          <img class="brand__logo brand__logo--on-light" src="assets/images/logobig-ink.png" alt="" aria-hidden="true" width="1580" height="171" decoding="async">
        </span>
        <div class="dropzone" role="button" tabindex="0" data-action="open-dump" aria-label="Choose a dump file">
          <span class="dropzone__art">${icon('upload_file')}</span>
          <span class="dropzone__title">Drop the dump here, or choose a file</span>
          <span class="dropzone__hint">Drop two dumps together to compare their mods, plugins, configuration and triage signals</span>
        </div>
      </div>
    </div>
  </div>`;
}

function markdownReport() {
  return buildReport(state.model, state.analysis);
}

function copyText(text, message = 'Copied to the clipboard') {
  const done = () => toast(message, 'info');
  const failed = () => toast('The browser refused the clipboard. Select the text and copy it manually.', 'warning');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {
      if (legacyCopy(text)) done();
      else failed();
    });
  } else if (legacyCopy(text)) done();
  else failed();
}

function legacyCopy(text) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function download(text, fileName, type = 'text/markdown') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`Saved ${fileName}`, 'info');
}

function navigateTo(view, params) {
  navigate(view, params || {});
}

function resolveFinding(id) {
  return state.analysis?.findings.find((finding) => finding.id === id) || null;
}

function toggleFlag(value) {
  patchParams({ flags: toggleInList(state.params.flags, value) });
}

function clearFilters() {
  patchParams({ q: null, flags: null, status: null, category: null, sev: null, family: null, focus: null, more: null });
}

function moveRow(direction) {
  const rows = [...main.querySelectorAll('tbody .row, .subject__button, .finding__summary, .raw-result, .node__toggle')];
  if (!rows.length) return;
  const index = rows.indexOf(document.activeElement);
  const next = index === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, index + direction));
  rows[next].focus();
}

const actions = {
  navigate: (element) => {
    const params = element.dataset.params ? JSON.parse(element.dataset.params) : {};
    navigateTo(element.dataset.view, params);
  },
  'open-dump': () => { pendingRole = 'current'; fileInput.click(); },
  'load-reference': () => { pendingRole = 'reference'; fileInput.click(); },
  'load-reference-drop': () => { pendingRole = 'reference'; fileInput.click(); },
  'restore-session': () => restoreStored('current'),
  'restore-reference': () => restoreStored('reference'),
  'clear-reference': () => unload({ role: 'reference' }),
  unload: () => { unload({ role: 'current' }); navigateTo('overview'); },
  'dismiss-error': () => { state.error = null; render(); },
  'toggle-drawer': () => toggleDrawer(),
  'close-drawer': () => closeDrawer(),
  'open-theme': (element) => openThemeMenu(element),
  'open-report': (element) => openReportMenu(element),
  'open-help': () => openHelpDialog(),
  'close-dialog': (element) => { element.closest('md-dialog')?.close(); },
  copy: (element) => copyText(element.dataset.copy || ''),
  'filter-name': (element) => {
    document.getElementById('dialog-detail').close();
    navigateTo('mods', { q: element.dataset.value });
  },
  'copy-link': (element) => copyText(`${window.location.origin}${window.location.pathname}${buildHash('findings', { open: element.dataset.id })}`, 'Link copied'),
  'copy-finding': (element) => {
    const finding = resolveFinding(element.dataset.id);
    if (finding) copyText(findingText(finding, state.model), 'Check copied as Markdown');
  },
  'copy-environment': () => copyText(environmentText(state.model), 'Environment block copied'),
  'copy-json': () => copyText(JSON.stringify(state.model.raw, null, 2), 'Raw JSON copied'),
  'copy-report': () => copyText(markdownReport(), 'Report copied as Markdown'),
  'download-report-md': () => download(markdownReport(), reportFileName(state.model)),
  'download-json': () => download(JSON.stringify(state.model.raw, null, 2), state.model.fileName, 'application/json'),
  'toggle-flag': (element) => toggleFlag(element.dataset.value),
  'set-status': (element) => patchParams({ status: element.dataset.value === 'all' ? null : element.dataset.value }),
  'toggle-sev': (element) => patchParams({ sev: toggleInList(state.params.sev, element.dataset.value) }),
  'toggle-family': (element) => patchParams({ family: toggleInList(state.params.family, element.dataset.value) }),
  'clear-filters': () => clearFilters(),
  'clear-focus': () => patchParams({ focus: null }),
  'toggle-more': (element) => patchParams({ more: element.dataset.value === '1' ? '1' : null }),
  'toggle-expand': (element) => patchParams({ expand: element.dataset.value === '1' ? '1' : null, open: null }),
  'sort-column': (element) => {
    const key = element.dataset.value;
    const same = state.params.sort === key;
    const dir = same && state.params.dir !== 'desc' ? 'desc' : same ? 'asc' : 'asc';
    patchParams({ sort: key, dir });
  },
  'inspect-character': (element) => openCharacterDialog(state, element.dataset.list, element.dataset.index),
  'inspect': (element) => {
    if (element.dataset.kind === 'other-file') return openOtherFileDialog(state, element.dataset.id);
    if (element.dataset.kind === 'plugin') openPluginDialog(state, element.dataset.id);
    else openModDialog(state, element.dataset.id);
  },
  'open-raw': (element) => {
    document.getElementById('dialog-detail').close();
    navigate('raw', { path: element.dataset.path });
  },
  'open-path': (element) => {
    const path = element.dataset.path;
    navigate('raw', { path, q: state.params.q || '' });
  },
  'clear-path': () => patchParams({ path: null }),
  'toggle-node': (element) => {
    const path = element.dataset.path;
    const open = parseList(state.params.open);
    const next = open.includes(path) ? open.filter((entry) => entry !== path) : [...open, path];
    patchParams({ open: next.slice(-200).join(',') });
  },
  'toggle-all-nodes': () => patchParams({ open: collectAllPaths().slice(0, 400).join(',') }),
  'dismiss-toast': (element) => dismissToast(element.dataset.id),
  'swap-compare': () => swapDumps()
};

function collectAllPaths() {
  const paths = [];
  const walk = (value, path, depth) => {
    if (depth > 4 || paths.length > 400) return;
    paths.push(path);
    if (Array.isArray(value)) value.slice(0, 3).forEach((child, index) => walk(child, `${path}[${index}]`, depth + 1));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => walk(child, `${path}.${key}`, depth + 1));
  };
  walk(state.model.raw, '$', 0);
  return paths;
}

document.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action]');
  if (!element) return;
  const action = element.dataset.action;
  const handler = actions[action];
  if (!handler) return;
  event.preventDefault();
  event.stopPropagation();
  closeMenus();
  handler(element, event);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeMenus();
    closeDrawer();
    return;
  }
  const inField = event.target.closest('input, textarea, md-outlined-text-field, md-outlined-select');
  if (event.key === '?' && !inField) {
    event.preventDefault();
    openHelpDialog();
    return;
  }
  if (event.key === '/' && !inField) {
    event.preventDefault();
    focusSearch();
    return;
  }
  if (event.altKey && /^[1-8]$/.test(event.key)) {
    const view = ['overview', 'findings', 'mods', 'plugins', 'environment', 'raw', 'compare', 'css-editor'][Number(event.key) - 1];
    event.preventDefault();
    navigateTo(view);
    return;
  }
  if (inField) return;
  if (event.key === 'j' || (event.key === 'ArrowDown' && event.shiftKey)) {
    event.preventDefault();
    moveRow(1);
    return;
  }
  if (event.key === 'k' || (event.key === 'ArrowUp' && event.shiftKey)) {
    event.preventDefault();
    moveRow(-1);
    return;
  }
  if (event.key === 'Enter') {
    const element = document.activeElement?.closest?.('[data-action]');
    if (element && (element.tagName === 'TR' || element.classList.contains('subject__button'))) {
      const handler = actions[element.dataset.action];
      if (handler) {
        event.preventDefault();
        handler(element, event);
      }
    }
  }
});

document.addEventListener('input', (event) => {
  const control = event.target.closest('[data-control]');
  if (!control) return;
  const name = control.dataset.control;
  if (name !== 'q') return;
  const value = control.value;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => patchParams({ q: value }), 220);
});

document.addEventListener('change', (event) => {
  const control = event.target.closest('[data-control]');
  if (!control) return;
  const name = control.dataset.control;
  if (name === 'q') return;
  if (name === 'sort') patchParams({ sort: control.value || 'index', dir: null });
  else if (name === 'category') patchParams({ category: control.value || null });
});

const reportMenu = document.getElementById('menu-report');
for (const item of reportMenu.querySelectorAll('[data-report]')) {
  item.addEventListener('click', () => {
    if (!state.model) return;
    const choice = item.dataset.report;
    if (choice === 'copy-markdown') copyText(markdownReport(), 'Report copied as Markdown');
    else if (choice === 'download-markdown') download(markdownReport(), reportFileName(state.model));
    else if (choice === 'download-json') download(JSON.stringify(state.model.raw, null, 2), state.model.fileName, 'application/json');
    else if (choice === 'copy-json') copyText(JSON.stringify(state.model.raw, null, 2), 'Raw JSON copied');
  });
}

fileInput.addEventListener('change', () => {
  const files = [...fileInput.files];
  fileInput.value = '';
  if (!files.length) return;
  if (pendingRole === 'reference' && files.length === 1) {
    loadFile(files[0], 'reference');
    pendingRole = 'current';
    return;
  }
  pendingRole = 'current';
  loadFiles(files);
});

document.addEventListener('mosaic:files', (event) => loadFiles(event.detail));

window.addEventListener('beforeunload', () => closeMenus());

initShell();
subscribe(render);
boot();
