import { basename, dirname, formatBytes, formatDateTime, formatNumber, formatRelative, pathTraits } from '../model.js';
import { defList, esc, icon, panelOpen, pluginChecklist, severityTag, statusChip } from './pieces.js';

function extraRows(extra, label) {
  const entries = Object.entries(extra || {});
  if (!entries.length) return '';
  return `<div class="extras">
    <h3 class="block__title">Additional ${esc(label)} fields</h3>
    <ul class="extras__list">
      ${entries.map(([key, value]) => `<li class="extras__row">
        <span class="extras__key value--mono">${esc(key)}</span>
        <span class="extras__value value--mono">${esc(typeof value === 'object' ? JSON.stringify(value) : value)}</span>
      </li>`).join('')}
    </ul>
  </div>`;
}

function pathRow(label, value) {
  const traits = pathTraits(value);
  return {
    label,
    value: value || null,
    mono: true,
    copy: Boolean(value),
    hint: traits.length
      ? `${icon('warning')} ${traits.join(', ')}`
      : value
        ? `folder: ${basename(value) || '—'} · parent: ${dirname(value) || '—'}`
        : 'not recorded in this dump',
    hintTone: traits.length ? 'warning' : 'muted'
  };
}

export function renderEnvironment(state) {
  const { model } = state;
  const app = model.app;
  const system = model.system;
  const configuration = model.configuration;
  const mods = model.libraries.mods;
  const plugins = model.libraries.plugins;

  const appRows = defList([
    { label: 'Name', value: app.name },
    { label: 'Version', value: app.version, hint: app.version && /-(alpha|beta|rc|pre|dev)/i.test(app.version) ? 'pre-release build' : null },
    { label: 'Electron', value: app.electron },
    { label: 'Chrome', value: app.chrome },
    { label: 'Node', value: app.node }
  ]) + extraRows(app.extra, 'application');

  const systemRows = defList([
    { label: 'Platform', value: system.platform },
    { label: 'Architecture', value: system.arch },
    { label: 'OS release', value: system.osRelease },
    { label: 'Total memory', value: formatBytes(system.memory), hint: system.memory !== null ? `${formatNumber(system.memory)} bytes` : null },
    { label: 'CPU cores', value: system.cpuCount !== null ? formatNumber(system.cpuCount) : null },
    { label: 'Locale', value: system.locale }
  ]) + extraRows(system.extra, 'system');

  const configRows = defList([
    { label: 'Run mode', value: configuration.runMode },
    { label: 'Emulator', value: configuration.emulatorType },
    pathRow('Mods path', configuration.modsPath),
    pathRow('Plugins path', configuration.pluginsPath),
    { label: 'Mods library', value: mods.configured === null ? 'state not recorded' : mods.configured ? 'configured' : 'not configured', hint: `${formatNumber(mods.items.length)} entries listed` },
    { label: 'Plugins library', value: plugins.configured === null ? 'state not recorded' : plugins.configured ? 'configured' : 'not configured', hint: `${formatNumber(plugins.items.length)} entries listed` }
  ]) + extraRows(configuration.extra, 'configuration');

  const checklist = pluginChecklist(plugins.items);

  const notes = model.notes.length
    ? `<ul class="notes">
        ${model.notes.map((note) => `<li class="note">
          ${severityTag(note.level === 'critical' ? 'critical' : note.level === 'warning' ? 'warning' : 'info', note.level)}
          <span class="note__path value--mono">${esc(note.path)}</span>
          <span class="note__message">${esc(note.message)}</span>
        </li>`).join('')}
      </ul>`
    : `<p class="prose">Every documented field is present and typed as expected.</p>`;

  const generated = model.generatedAtMs !== null
    ? `${formatDateTime(model.generatedAtMs)} · ${formatRelative(model.generatedAtMs)}`
    : model.generatedAt || 'not recorded';

  return `<div class="view view--environment">
    <header class="view__head">
      <div>
        <h1 class="view__title">Environment</h1>
        <p class="view__sub">Everything the dump records about the machine, the build and the paths, kept exactly as written.</p>
      </div>
      <div class="view__actions">
        <md-text-button data-action="copy-environment">${icon('content_copy')}Copy environment block</md-text-button>
      </div>
    </header>
    <div class="env-grid">
      ${panelOpen('Dump', `Generated ${generated}`, defList([
        { label: 'File', value: model.fileName },
        { label: 'Generated at', value: model.generatedAt, mono: true },
        { label: 'Schema version', value: model.schemaVersion !== null ? `v${model.schemaVersion}` : null },
        { label: 'Sections', value: Object.keys(model.raw || {}).join(', '), mono: true }
      ]), 'panel--dump')}
      ${panelOpen('Application', 'The build that wrote this dump', appRows, 'panel--app')}
      ${panelOpen('System', 'Hardware and OS as reported', systemRows, 'panel--system')}
      ${panelOpen('Configuration', 'Run mode and library paths', configRows, 'panel--config')}
      ${panelOpen('Plugin checklist', 'Plugins a working install is expected to have', checklist, 'panel--checklist')}
      ${panelOpen('Dump integrity', `${formatNumber(model.notes.length)} ${model.notes.length === 1 ? 'caution' : 'cautions'} while reading the file`, notes, 'panel--notes')}
    </div>
  </div>`;
}
