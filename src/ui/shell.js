import { formatDateTime, formatNumber, formatRelative, plural } from '../model.js';
import { modeLabel, contrastLabel } from '../theme.js';
import { esc, icon } from './pieces.js';
import { setPrefs } from '../store.js';

const NAV = [
  { view: 'overview', label: 'Overview', icon: 'dashboard' },
  { view: 'findings', label: 'Triage signals', icon: 'troubleshoot' },
  { view: 'mods', label: 'Mods', icon: 'extension' },
  { view: 'plugins', label: 'Plugins', icon: 'memory' },
  { view: 'environment', label: 'Environment', icon: 'devices' },
  { view: 'raw', label: 'Raw dump', icon: 'data_object' },
  { view: 'compare', label: 'Compare', icon: 'compare_arrows' },
  { view: 'css-editor', label: 'CSS Editor', icon: 'grid_view' }
];

const refs = {};

export function initShell() {
  refs.dumpBar = document.getElementById('dump-bar');
  refs.rail = document.getElementById('rail');
  refs.drawer = document.getElementById('drawer');
  refs.drawerNav = refs.drawer.querySelector('.drawer__nav');
  refs.toasts = document.getElementById('toasts');
  refs.fileInput = document.getElementById('file-input');
  refs.reportButton = document.getElementById('report-button');
  refs.themeIcon = document.getElementById('theme-icon');
  refs.themeMenu = document.getElementById('menu-theme');
  refs.reportMenu = document.getElementById('menu-report');
  refs.dropOverlay = document.getElementById('drop-overlay');
  refs.main = document.getElementById('main');

  refs.drawerNav.innerHTML = NAV.map((item) => `<a class="drawer__dest" href="#/${item.view}" data-view="${item.view}">
    ${icon(item.icon)}<span>${item.label}</span>
  </a>`).join('');

  refs.drawer.addEventListener('click', (event) => {
    if (event.target.closest('[data-view]')) refs.drawer.close();
  });
  refs.drawer.addEventListener('close', () => document.body.classList.remove('drawer-open'));

  for (const item of refs.themeMenu.querySelectorAll('[data-theme-choice]')) {
    item.addEventListener('click', () => setPrefs({ mode: item.dataset.themeChoice }));
  }
  for (const item of refs.themeMenu.querySelectorAll('[data-contrast-choice]')) {
    item.addEventListener('click', () => setPrefs({ contrast: Number(item.dataset.contrastChoice) }));
  }

  let dragDepth = 0;
  const showOverlay = () => refs.dropOverlay.classList.add('is-active');
  const hideOverlay = () => refs.dropOverlay.classList.remove('is-active');
  window.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dragDepth += 1;
    showOverlay();
  });
  window.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) hideOverlay();
  });
  window.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    dragDepth = 0;
    hideOverlay();
    refs.fileInput.dispatchEvent(new CustomEvent('mosaic:files', { detail: [...event.dataTransfer.files], bubbles: true }));
  });
  window.addEventListener('dragover', (event) => event.preventDefault());
}

export function openDrawer() {
  if (!refs.drawer.open) refs.drawer.showModal();
  document.body.classList.add('drawer-open');
}

export function closeDrawer() {
  if (refs.drawer.open) refs.drawer.close();
  document.body.classList.remove('drawer-open');
}

export function toggleDrawer() {
  if (refs.drawer.open) closeDrawer();
  else openDrawer();
}

export function openThemeMenu() {
  refs.themeMenu.anchor = 'theme-button';
  refs.themeMenu.open = true;
}

export function openReportMenu() {
  refs.reportMenu.anchor = 'report-button';
  refs.reportMenu.open = true;
}

export function closeMenus() {
  refs.themeMenu.open = false;
  refs.reportMenu.open = false;
}

export function focusSearch() {
  const target = refs.main.querySelector('[data-control="q"]') || refs.main.querySelector('[data-control]');
  if (target) target.focus();
}

export function renderShell(state) {
  const { model, analysis, prefs, diff } = state;
  const hasModel = Boolean(model);

  refs.reportButton.hidden = !hasModel;
  const compareAction = document.querySelector('.action-compare');
  if (compareAction) compareAction.hidden = !state.reference;
  refs.themeIcon.textContent = prefs.mode === 'light' ? 'light_mode' : prefs.mode === 'dark' ? 'dark_mode' : 'brightness_auto';
  const themeButton = document.querySelector('[data-action="open-theme"]');
  if (themeButton) themeButton.title = `Appearance — ${modeLabel(prefs.mode)}, ${contrastLabel(prefs.contrast)}`;

  for (const link of refs.rail.querySelectorAll('[data-view]')) {
    const active = link.dataset.view === state.view;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const link of refs.drawerNav.querySelectorAll('[data-view]')) {
    const active = link.dataset.view === state.view;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  const findingsBadge = document.getElementById('rail-findings');
  const modsBadge = document.getElementById('rail-mods');
  const pluginsBadge = document.getElementById('rail-plugins');
  if (hasModel) {
    const alerting = analysis.signals.counts.critical + analysis.signals.counts.warning;
    findingsBadge.hidden = false;
    findingsBadge.textContent = formatNumber(alerting || analysis.signals.counts.info);
    findingsBadge.className = `rail__badge rail__badge--${analysis.signals.counts.critical ? 'critical' : analysis.signals.counts.warning ? 'warning' : 'muted'}`;
    modsBadge.hidden = false;
    modsBadge.textContent = formatNumber(model.libraries.mods.items.length);
    pluginsBadge.hidden = false;
    pluginsBadge.textContent = formatNumber(model.libraries.plugins.items.length);
  } else {
    findingsBadge.hidden = true;
    modsBadge.hidden = true;
    pluginsBadge.hidden = true;
  }

  renderDumpBar(state);
  refs.toasts.innerHTML = state.toasts.length
    ? state.toasts.map((toast) => `<div class="toast toast--${toast.tone}">
        ${icon(toast.tone === 'critical' ? 'error' : toast.tone === 'warning' ? 'warning' : toast.tone === 'info' ? 'info' : 'check_circle')}
        <span class="toast__text">${esc(toast.message)}</span>
        <button class="icon-action" type="button" data-action="dismiss-toast" data-id="${toast.id}" aria-label="Dismiss">${icon('close')}</button>
      </div>`).join('')
    : '';
}


function renderDumpBar(state) {
  const { model, analysis, diff } = state;
  if (!model) {
    refs.dumpBar.hidden = true;
    refs.dumpBar.innerHTML = '';
    return;
  }
  refs.dumpBar.hidden = false;
  const libraryCounts = [
    `${formatNumber(model.libraries.mods.items.length)} ${plural(model.libraries.mods.items.length, 'mod')}`,
    model.libraries.mods.counts.active ? `${formatNumber(model.libraries.mods.counts.active)} active` : null,
    `${formatNumber(model.libraries.plugins.items.length)} ${plural(model.libraries.plugins.items.length, 'plugin')}`
  ].filter(Boolean).join(' · ');

  const stale = model.generatedAtMs !== null && Date.now() - model.generatedAtMs > 24 * 3600 * 1000;
  const facts = [
    model.generatedAtMs !== null ? { iconName: 'schedule', text: `${formatDateTime(model.generatedAtMs)} · ${formatRelative(model.generatedAtMs)}`, warn: stale } : null,
    { iconName: 'apps', text: `${model.app.name || 'unknown app'} ${model.app.version || ''}`.trim() },
    { iconName: 'memory', text: [model.system.platform, model.system.arch].filter(Boolean).join(' · ') || 'system unknown' },
    { iconName: 'tune', text: [model.configuration.runMode, model.configuration.emulatorType].filter(Boolean).join(' · ') || 'mode unknown' },
    { iconName: 'extension', text: libraryCounts }
  ].filter(Boolean);

  refs.dumpBar.innerHTML = `
    <div class="dump-bar__row">
      <div class="dump-bar__identity">
        ${icon('description')}
        <span class="dump-bar__name" title="${esc(model.fileName)}">${esc(model.fileName)}</span>
        <span class="chip chip--muted">${model.schemaVersion !== null ? `schema v${model.schemaVersion}` : 'schema unknown'}</span>
        <button class="icon-action" type="button" data-action="unload" title="Close this dump and start over" aria-label="Close this dump">${icon('close')}</button>
      </div>
      <button class="triage-link" type="button" data-action="navigate" data-view="findings" title="Review automatic signals and compare them with the reported symptoms">
        <span class="triage-link__text">
          <span class="triage-link__label">Triage signals</span>
          <span class="triage-link__detail">${formatNumber(analysis.signals.total)} matched in this dump</span>
        </span>
      </button>
    </div>
    <div class="dump-bar__facts">
      ${facts.map((fact) => `<span class="fact${fact.warn ? ' fact--warn' : ''}">${icon(fact.iconName)}<span>${esc(fact.text)}</span></span>`).join('')}
      ${diff ? `<a class="fact fact--link" href="#/compare">${icon('compare_arrows')}<span>${formatNumber(diff.summary.mods.added + diff.summary.mods.removed + diff.summary.mods.changed)} mod changes vs reference</span></a>` : ''}
    </div>`;
}
