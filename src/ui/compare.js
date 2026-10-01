import { formatDateTime, formatNumber, formatRelative, SEVERITY_LABEL } from '../model.js';
import { FAMILY_LABEL } from '../analysis.js';
import { emptyState, esc, icon, panelOpen, severityVar, statusChip } from './pieces.js';

const arrow = () => icon('arrow_forward', 'change__arrow');

function dumpCard(model, role, state) {
  return `<div class="dump-card dump-card--${role}">
    <span class="chip chip--${role === 'reference' ? 'muted' : 'info'}">${role === 'reference' ? 'Reference' : 'Current'}</span>
    <span class="dump-card__name">${esc(model.fileName)}</span>
    <span class="dump-card__meta">${model.generatedAtMs !== null ? `${esc(formatDateTime(model.generatedAtMs))} · ${esc(formatRelative(model.generatedAtMs))}` : 'no timestamp'}</span>
    <span class="dump-card__meta">${formatNumber(model.libraries.mods.items.length)} mods · ${formatNumber(model.libraries.plugins.items.length)} plugins</span>
  </div>`;
}

function entryRow(entry, tone) {
  return `<li class="change change--${tone}">
    <span class="change__dot" style="background:${tone === 'added' ? severityVar('ok') : tone === 'removed' ? severityVar('critical') : severityVar('warning')}"></span>
    <span class="change__label">${esc(entry.label || entry.name || entry.folderName)}</span>
    <span class="change__detail value--mono">${esc(entry.folderName || entry.slug || entry.repository || '')}</span>
    ${entry.status ? statusChip(entry.status) : ''}
  </li>`;
}

function changeRow(change) {
  return `<li class="change change--changed">
    <span class="change__dot" style="background:${severityVar('warning')}"></span>
    <span class="change__label">${esc(change.label)}</span>
    <span class="change__fields">
        ${change.fields.map((field) => `<span class="field-change">
        <span class="field-change__name">${esc(field.label)}</span>
        <span class="field-change__from">${esc(field.before === null || field.before === undefined ? '—' : String(field.before))}</span>
        ${arrow()}
        <span class="field-change__to">${esc(field.after === null || field.after === undefined ? '—' : String(field.after))}</span>
      </span>`).join('')}
    </span>
  </li>`;
}

function fieldDiffList(rows) {
  if (!rows.length) return '';
  return `<ul class="changes">
    ${rows.map((row) => `<li class="change change--changed">
      <span class="change__dot" style="background:${severityVar('warning')}"></span>
      <span class="change__label">${esc(row.label)}</span>
      <span class="change__fields"><span class="field-change">
        <span class="field-change__from">${esc(row.before === null || row.before === undefined ? '—' : String(row.before))}</span>
        ${arrow()}
        <span class="field-change__to">${esc(row.after === null || row.after === undefined ? '—' : String(row.after))}</span>
      </span></span>
    </li>`).join('')}
  </ul>`;
}

function changeBlock(title, subtitle, groups) {
  const content = groups.filter((group) => group.items.length).map((group) => `<div class="group">
    <div class="group__head">
      <span class="group__label">${esc(group.label)}</span>
      <span class="chip chip--${group.tone}">${formatNumber(group.items.length)}</span>
    </div>
    ${group.kind === 'fields' ? fieldDiffList(group.items) : `<ul class="changes">${group.items.slice(0, 200).map((item) => group.render(item)).join('')}</ul>`}
    ${group.items.length > 200 ? `<p class="hint">Showing the first 200 of ${formatNumber(group.items.length)}.</p>` : ''}
  </div>`).join('');
  if (!content) return '';
  return panelOpen(title, subtitle, content, 'panel--changes');
}

function summaryStrip(summary, diff) {
  const cells = [
    { label: 'Mods added', value: summary.mods.added, tone: 'ok' },
    { label: 'Mods removed', value: summary.mods.removed, tone: 'critical' },
    { label: 'Mods changed', value: summary.mods.changed, tone: 'warning' },
    { label: 'Plugins changed', value: summary.plugins.added + summary.plugins.removed + summary.plugins.changed, tone: 'warning' },
    { label: 'Config fields', value: summary.config, tone: 'warning' },
    { label: 'New signals', value: summary.findings.new, tone: 'critical' },
    { label: 'Signals no longer matched', value: summary.findings.resolved, tone: 'ok' }
  ];
  return `<div class="summary-strip">
    ${cells.map((cell) => `<div class="summary-cell summary-cell--${cell.tone}${cell.value ? '' : ' summary-cell--zero'}">
      <span class="summary-cell__value">${formatNumber(cell.value)}</span>
      <span class="summary-cell__label">${esc(cell.label)}</span>
    </div>`).join('')}
  </div>`;
}

function findingsDelta(diff) {
  const content = `
    ${diff.findings.added.length ? `<div class="group">
      <div class="group__head"><span class="group__label">Signals that appeared</span><span class="chip chip--crit">${formatNumber(diff.findings.added.length)}</span></div>
      <ul class="changes">${diff.findings.added.map((finding) => `<li class="change">
        <span class="change__dot" style="background:${severityVar(finding.severity)}"></span>
        <span class="change__label">${esc(finding.title)}</span>
        <span class="change__detail">${esc(FAMILY_LABEL[finding.family] || finding.family)}</span>
      </li>`).join('')}</ul>
    </div>` : ''}
    ${diff.findings.removed.length ? `<div class="group">
      <div class="group__head"><span class="group__label">Signals no longer matched</span><span class="chip chip--ok">${formatNumber(diff.findings.removed.length)}</span></div>
      <ul class="changes">${diff.findings.removed.map((finding) => `<li class="change">
        <span class="change__dot" style="background:var(--mi-ok)"></span>
        <span class="change__label">${esc(finding.title)}</span>
        <span class="change__detail">${esc(FAMILY_LABEL[finding.family] || finding.family)}</span>
      </li>`).join('')}</ul>
    </div>` : ''}
    ${diff.findings.changed.length ? `<div class="group">
      <div class="group__head"><span class="group__label">Signals with a changed scope</span><span class="chip chip--warn">${formatNumber(diff.findings.changed.length)}</span></div>
      <ul class="changes">${diff.findings.changed.map((finding) => `<li class="change change--changed">
        <span class="change__label">${esc(finding.title)}</span>
        <span class="change__fields"><span class="field-change">
          <span class="field-change__from">${formatNumber(finding.before)} (${esc(SEVERITY_LABEL[finding.beforeSeverity])})</span>
          ${arrow()}
          <span class="field-change__to">${formatNumber(finding.count)} (${esc(SEVERITY_LABEL[finding.severity])})</span>
        </span></span>
      </li>`).join('')}</ul>
    </div>` : ''}`;
  if (!content.trim()) return panelOpen('Triage signals', 'Same checks on both dumps', '<p class="prose">The same checks matched the same scope in both dumps.</p>', 'panel--diagnostics');
  return panelOpen('Triage signals', 'What changed in the automatic checks', content, 'panel--diagnostics');
}

export function renderCompare(state) {
  const { model, reference, diff, stored } = state;

  if (!model) {
    return `<div class="view view--compare">${emptyState({
      iconName: 'compare_arrows',
      title: 'Load a dump first',
      body: 'Comparison needs a current dump. Drop a file anywhere on this page or pick one to get started.'
    })}</div>`;
  }

  if (!reference) {
    return `<div class="view view--compare">
      <header class="view__head">
        <div>
          <h1 class="view__title">Compare</h1>
          <p class="view__sub">Load an older dump as the reference. Every difference is then read as “what changed since then”, which is the fastest way to see what a mod install, an update or a settings change actually did.</p>
        </div>
      </header>
      <div class="compare-intro">
        ${dumpCard(model, 'current', state)}
        <div class="compare-intro__body">
          <h2 class="panel__title">Choose a reference dump</h2>
          <p class="prose">The reference is the older file. Anything present only in the current dump is an addition, anything gone from the current dump is a removal.</p>
          <div class="compare-intro__actions">
            <md-filled-button data-action="load-reference">${icon('folder_open')}Choose a file</md-filled-button>
            ${stored.reference ? `<md-outlined-button data-action="restore-reference">${icon('history')}Restore ${esc(stored.reference.name)}</md-outlined-button>` : ''}
            <md-text-button data-action="load-reference-drop">${icon('upload_file')}Drop a file here instead</md-text-button>
          </div>
        </div>
      </div>
    </div>`;
  }

  const { summary } = diff;
  const identical = summary.mods.added + summary.mods.removed + summary.mods.changed + summary.plugins.added + summary.plugins.removed + summary.plugins.changed + summary.config + summary.environment + summary.findings.new + summary.findings.resolved + summary.findings.changed === 0;

  const modsBlock = changeBlock('Mods', 'Folders added, removed or changed between the two dumps', [
    { label: 'Added', tone: 'ok', kind: 'entries', items: diff.mods.added, render: (entry) => entryRow(entry, 'added') },
    { label: 'Removed', tone: 'crit', kind: 'entries', items: diff.mods.removed, render: (entry) => entryRow(entry, 'removed') },
    { label: 'Changed', tone: 'warn', kind: 'entries',    items: diff.mods.changed, render: (entry) => changeRow(entry) }
  ]);

  const pluginsBlock = changeBlock('Plugins', 'Plugin files added, removed or changed', [
    { label: 'Added', tone: 'ok', kind: 'entries', items: diff.plugins.added, render: (entry) => entryRow(entry, 'added') },
    { label: 'Removed', tone: 'crit', kind: 'entries', items: diff.plugins.removed, render: (entry) => entryRow(entry, 'removed') },
    { label: 'Changed', tone: 'warn', kind: 'entries',    items: diff.plugins.changed, render: (entry) => changeRow(entry) }
  ]);

  const configBlock = changeBlock('Configuration and environment', 'Run mode, paths and machine details', [
    { label: 'Configuration', tone: 'warn', kind: 'fields', items: diff.config },
    { label: 'Environment', tone: 'warn', kind: 'fields', items: [...diff.app, ...diff.system] }
  ]);

  return `<div class="view view--compare">
    <header class="view__head">
      <div>
        <h1 class="view__title">Compare</h1>
        <p class="view__sub">${describeGap(diff.buildTime)} Reference on the left, current on the right.</p>
      </div>
      <div class="view__actions">
        <md-text-button data-action="swap-compare">${icon('swap_horiz')}Swap sides</md-text-button>
        <md-text-button data-action="clear-reference">${icon('close')}Drop reference</md-text-button>
      </div>
    </header>
    <div class="compare-heads">
      ${dumpCard(reference, 'reference', state)}
      ${icon('trending_flat', 'compare-heads__arrow')}
      ${dumpCard(model, 'current', state)}
    </div>
    ${summaryStrip(summary, diff)}
    ${identical ? `<div class="identical">${icon('check_circle')}<p>No difference found between the two dumps.</p></div>` : ''}
    <div class="compare-grid">
      ${modsBlock}
      ${pluginsBlock}
      ${configBlock}
      ${findingsDelta(diff)}
    </div>
  </div>`;
}

function describeGap(ms) {
  if (ms === null) return 'Both dumps are shown side by side.';
  if (Math.abs(ms) < 2000) return 'Both dumps were generated at the same moment.';
  if (ms < 0) return `The current dump is older than the reference by ${relativeSpan(ms)}.`;
  return `The current dump was generated ${relativeSpan(ms)} after the reference.`;
}

function relativeSpan(ms) {
  const abs = Math.abs(ms) / 1000;
  if (abs < 90) return `${Math.round(abs)} seconds`;
  if (abs < 5400) return `${Math.round(abs / 60)} minutes`;
  if (abs < 172800) return `${Math.round(abs / 3600)} hours`;
  return `${Math.round(abs / 86400)} days`;
}
