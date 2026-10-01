import { formatBytes, formatDateTime, formatNumber, formatRelative, plural } from '../model.js';
import { FAMILY_LABEL } from '../analysis.js';
import { defList, esc, icon, panelOpen, pluginChecklist, severityTag, severityVar, statusChip } from './pieces.js';

function ledgerRow(severity, count, instances, max) {
  const width = Math.max(3, Math.round((count / Math.max(max, 1)) * 100));
  return `<li class="ledger__row">
    <span class="ledger__tag">${severityTag(severity)}</span>
    <span class="ledger__count">${formatNumber(count)}</span>
    <span class="ledger__unit">${plural(count, 'signal')}</span>
    <span class="ledger__bar"><span class="ledger__fill" style="width:${width}%;background:${severityVar(severity)}"></span></span>
    <span class="ledger__instances">${formatNumber(instances)} ${plural(instances, 'instance')}</span>
  </li>`;
}

function findingRow(finding) {
  return `<li class="ledger__entry">
    <button class="ledger__link" type="button" data-action="navigate" data-view="findings" data-params="${esc(JSON.stringify({ open: finding.id }))}">
      <span class="ledger__sev" style="background:${severityVar(finding.severity)}"></span>
      <span class="ledger__entry-title">${esc(finding.title)}</span>
      <span class="ledger__entry-meta">${esc(FAMILY_LABEL[finding.family] || finding.family)}</span>
      <span class="ledger__entry-count">${formatNumber(finding.count)}</span>
      ${icon('chevron_right', 'ledger__chev')}
    </button>
  </li>`;
}

function inventoryPanel(model) {
  const mods = model.libraries.mods;
  const total = Math.max(mods.items.length, 1);
  const activeWidth = Math.round((mods.counts.active / total) * 100);
  const otherWidth = Math.round((mods.counts.other / total) * 100);
  const disabledWidth = Math.max(0, 100 - activeWidth - otherWidth);
  const categories = [...model.index.categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9);
  const maxCategory = categories.length ? Math.max(...categories.map(([, count]) => count)) : 1;
  const plugins = model.libraries.plugins.items;

  const body = `
    <div class="inventory__block">
      <h3 class="block__title">Mods</h3>
      <div class="split-bar" role="img" aria-label="${formatNumber(mods.counts.active)} active, ${formatNumber(mods.counts.disabled)} disabled, ${formatNumber(mods.counts.other)} without status">
        <span class="split-bar__part" style="width:${activeWidth}%;background:var(--mi-ok)"></span>
        <span class="split-bar__part" style="width:${otherWidth}%;background:var(--mi-crit)"></span>
        <span class="split-bar__part" style="width:${disabledWidth}%;background:var(--mi-muted-container)"></span>
      </div>
      <div class="split-legend">
        <span class="legend"><span class="legend__dot" style="background:var(--mi-ok)"></span>${formatNumber(mods.counts.active)} active</span>
        <span class="legend"><span class="legend__dot" style="background:var(--mi-muted-container)"></span>${formatNumber(mods.counts.disabled)} disabled</span>
        ${mods.counts.other ? `<span class="legend"><span class="legend__dot" style="background:var(--mi-crit)"></span>${formatNumber(mods.counts.other)} unknown status</span>` : ''}
      </div>
      <ul class="cat-list">
        ${categories.map(([name, count]) => `<li class="cat"><span class="cat__name">${esc(name)}</span><span class="cat__bar"><span class="cat__fill" style="width:${Math.max(4, Math.round((count / maxCategory) * 100))}%"></span></span><span class="cat__count">${formatNumber(count)}</span></li>`).join('')}
      </ul>
      ${model.index.categories.size > categories.length ? `<p class="hint">${formatNumber(model.index.categories.size - categories.length)} more ${plural(model.index.categories.size - categories.length, 'category', 'categories')}, including free-text values.</p>` : ''}
    </div>
    <div class="inventory__block">
      <h3 class="block__title">Plugins</h3>
      <ul class="plugin-list">
        ${plugins.map((plugin) => `<li class="plugin-row">
          ${statusChip(plugin.status)}
          <span class="plugin-row__name">${esc(plugin.name)}</span>
          <span class="plugin-row__version">${esc(plugin.version || 'no version')}</span>
          <span class="plugin-row__size">${esc(plugin.size || '')}</span>
        </li>`).join('') || '<li class="hint">No plugin listed.</li>'}
      </ul>
    </div>`;

  return panelOpen('Inventory', 'What the dump says is installed', body, 'panel--inventory');
}

export function renderOverview(state) {
  const { model, analysis } = state;
  if (!model) return '';
  const signals = analysis.signals;
  const alerts = analysis.findings.filter((finding) => finding.severity !== 'ok');
  const peak = Math.max(1, ...['critical', 'warning', 'info', 'ok'].map((severity) => signals.instances[severity]));
  const ledgerRows = ['critical', 'warning', 'info', 'ok']
    .filter((severity) => signals.counts[severity] > 0)
    .map((severity) => ledgerRow(severity, signals.counts[severity], signals.instances[severity], peak));
  const topFindings = alerts.slice(0, 6);

  const ledger = `
    <div class="ledger__summary">
      <p class="ledger__sentence">${formatNumber(signals.total)} triage ${plural(signals.total, 'signal')} matched in this dump.</p>
      <p class="ledger__note">${formatNumber(signals.counts.ok)} checks did not match their conditions. Matches are leads to compare with the reported symptoms.</p>
    </div>
    <ul class="ledger__rows">${ledgerRows.join('')}</ul>
    ${topFindings.length ? `<ul class="ledger__entries">${topFindings.map(findingRow).join('')}</ul>` : ''}`;

  const context = defList([
    { label: 'Dump', value: model.fileName, hint: model.generatedAtMs ? `generated ${formatDateTime(model.generatedAtMs)} · ${formatRelative(model.generatedAtMs)}` : 'no timestamp' },
    { label: 'Application', value: `${model.app.name || 'unknown'} ${model.app.version || ''}`.trim(), hint: [model.app.electron && `Electron ${model.app.electron}`, model.app.chrome && `Chrome ${model.app.chrome}`, model.app.node && `Node ${model.app.node}`].filter(Boolean).join(' · ') },
    { label: 'System', value: [model.system.platform, model.system.arch, model.system.osRelease].filter(Boolean).join(' · '), hint: [formatBytes(model.system.memory), model.system.cpuCount && `${model.system.cpuCount} cores`, model.system.locale && `locale ${model.system.locale}`].filter(Boolean).join(' · ') },
    { label: 'Run mode', value: [model.configuration.runMode, model.configuration.emulatorType].filter(Boolean).join(' · ') },
    { label: 'Mods path', value: model.configuration.modsPath, mono: true, copy: true },
    { label: 'Plugins path', value: model.configuration.pluginsPath, mono: true, copy: true },
    { label: 'Schema', value: model.schemaVersion !== null ? `v${model.schemaVersion}` : 'unversioned', hint: `${formatNumber(model.notes.length)} schema ${plural(model.notes.length, 'caution')}` }
  ]);

  const runtime = [model.app.electron && `Electron ${model.app.electron}`, model.app.chrome && `Chrome ${model.app.chrome}`, model.app.node && `Node ${model.app.node}`].filter(Boolean).join(' · ');

  return `<div class="view view--overview">
    <h1 class="view__title">${esc(model.fileName)}${runtime ? ` <span class="view__title-sub">${esc(runtime)}</span>` : ''}</h1>
    <div class="overview">
      ${panelOpen('Triage signals', `${formatNumber(alerts.length)} signals to review`, ledger, 'panel--ledger')}
      ${panelOpen('Dump context', 'Facts this dump carries', context, 'panel--context')}
      ${inventoryPanel(model)}
      ${panelOpen('Plugin checklist', 'Expected plugins in this dump', pluginChecklist(model.libraries.plugins.items), 'panel--checklist')}
    </div>
  </div>`;
}
