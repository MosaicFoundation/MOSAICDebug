import { SEVERITY_LABEL, formatBytes, formatDateTime, formatNumber, formatRelative, siblingGroups } from '../model.js';
import { FAMILY_LABEL } from '../analysis.js';
import { MOD_FLAGS, PLUGIN_FLAGS } from '../filters.js';
import { defList, esc, icon, severityTag, statusChip } from './pieces.js';

const detail = document.getElementById('dialog-detail');
const help = document.getElementById('dialog-help');
const report = document.getElementById('dialog-report');

function setDialog(dialog, headline, content, actions) {
  dialog.querySelector('[slot="headline"]').innerHTML = headline;
  dialog.querySelector('[slot="content"]').innerHTML = content;
  dialog.querySelector('[slot="actions"]').innerHTML = actions;
  if (!dialog.open) dialog.show();
}

export function openHelpDialog() {
  const content = `
    <div class="help">
      <p class="prose">MOSAIC Debug is a local triage tool for investigating a Mosaic issue with a debug dump. It surfaces signals and keeps their supporting entries available to check against the reported symptoms. Nothing is uploaded: the file is parsed in this tab and the last two dumps are kept only in this browser.</p>
      <h3 class="block__title">Views</h3>
      <ul class="help__list">
        <li><strong>Overview</strong> — a triage summary, diagnostic signals and the context recorded in the dump.</li>
        <li><strong>Triage signals</strong> — potential leads with match rationale, possible relevance and related entries.</li>
        <li><strong>Mods</strong> — the full inventory: filter by signal, search, sort, open a row for its record.</li>
        <li><strong>Plugins</strong> — the plugin files and their versions.</li>
        <li><strong>Environment</strong> — application, system, configuration, paths and the plugin checklist.</li>
        <li><strong>Raw dump</strong> — the parsed JSON, searchable, every path copyable.</li>
        <li><strong>Compare</strong> — load a second dump to see exactly what changed.</li>
      </ul>
      <p class="prose">Automatic signals are leads, not confirmed causes. Use the supporting evidence with the reported symptoms, logs and other debugging information to help narrow down the issue.</p>
      <h3 class="block__title">Signal priority</h3>
      <ul class="help__list help__list--legend">
        <li>${severityTag('critical')} — a potential behavior-impacting signal; compare it with the reported symptoms.</li>
        <li>${severityTag('warning')} — a potential signal or inconsistency that may help narrow the investigation.</li>
        <li>${severityTag('info')} — context about the dump; it may not be related to the reported issue.</li>
        <li>${severityTag('ok')} — this check did not match the condition it looks for.</li>
      </ul>
      <h3 class="block__title">Keyboard</h3>
      <ul class="help__list help__list--keys">
        <li><kbd>/</kbd><span>Focus the search field of the current view</span></li>
        <li><kbd>?</kbd><span>Open this help</span></li>
        <li><kbd>Alt</kbd> + <kbd>1…8</kbd><span>Switch view</span></li>
        <li><kbd>Esc</kbd><span>Close a dialog or the navigation drawer</span></li>
        <li><kbd>K</kbd> / <kbd>J</kbd><span>Move between rows in a list</span></li>
        <li><kbd>Enter</kbd><span>Open the selected row</span></li>
      </ul>
      <h3 class="block__title">Dump layout</h3>
      <p class="prose">The reader expects <span class="value--mono">schemaVersion</span>, <span class="value--mono">generatedAt</span>, <span class="value--mono">app</span>, <span class="value--mono">system</span>, <span class="value--mono">configuration</span> and <span class="value--mono">libraries</span> with a <span class="value--mono">mods</span> and a <span class="value--mono">plugins</span> section. Unknown fields are kept in the raw view, missing ones are reported as cautions instead of breaking the page.</p>
    </div>`;
  setDialog(help, 'Using triage signals', content, '<md-filled-button data-action="close-dialog">Close</md-filled-button>');
}

export function openReportDialog(markdown, meta) {
  const content = `<div class="report">
    <p class="prose">${esc(meta)}</p>
    <pre class="report__pre" tabindex="0">${esc(markdown)}</pre>
  </div>`;
  setDialog(report, 'Triage report', content, `
    <md-text-button data-action="download-report-md">${icon('download')}Download .md</md-text-button>
    <md-text-button data-action="copy-report">${icon('content_copy')}Copy</md-text-button>
    <md-filled-button data-action="close-dialog">Close</md-filled-button>`);
}

function flagList(entry, defs) {
  const active = defs.filter((flag) => entry.flags?.has(flag.id));
  if (!active.length) return '<p class="prose">No signal was raised for this entry.</p>';
  return `<ul class="flag-legend">${active.map((flag) => `<li class="flag-legend__row">
    ${icon(flag.icon)}
    <span class="flag-legend__label">${esc(flag.label)}</span>
    <span class="flag-legend__hint">${esc(flag.hint)}</span>
  </li>`).join('')}</ul>`;
}

function siblingBlock(model, mod) {
  const groups = siblingGroups(model, mod);
  if (!groups.length) return '<p class="prose">No other entry in this dump points at the same folder or name.</p>';
  return groups.map((group) => `<div class="group">
    <div class="group__head">
      <span class="group__label">${esc(group.label)}</span>
      <span class="chip chip--muted">${formatNumber(group.items.length)}</span>
    </div>
    <p class="group__note">${esc(group.reason)}</p>
    <ul class="subjects">
      ${group.items.slice(0, 30).map((item) => `<li class="subject">
        <button class="subject__button" type="button" data-action="inspect" data-kind="mod" data-id="${esc(item.id)}">
          <span class="subject__label">${esc(item.name)}</span>
          <span class="subject__detail">${esc(item.folderName)}</span>
          ${statusChip(item.status)}
          ${icon('chevron_right', 'subject__chev')}
        </button>
      </li>`).join('')}
    </ul>
  </div>`).join('');
}

export function openCharacterDialog(state, list, index) {
  if (!['visibleCharacters', 'hiddenCharacters'].includes(list) || !/^\d+$/.test(String(index))) return;
  const entries = state.model?.raw?.cssEditor?.layout?.[list];
  const character = Array.isArray(entries) ? entries[Number(index)] : null;
  if (!character || typeof character !== 'object' || Array.isArray(character)) return;
  const valueText = (value) => value == null ? null : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const fields = (record) => defList(Object.entries(record).map(([key, value]) => ({
    label: key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, letter => letter.toUpperCase()),
    value: valueText(value),
    mono: /id$|kind|label|index/i.test(key)
  })));
  const { slots, ...metadata } = character;
  const content = `<div class="detail">
    <p class="prose">${list === 'visibleCharacters' ? 'Visible character' : 'Hidden character'} · CSS Editor</p>
    ${fields(metadata)}
    <section class="detail__block">
      <h3 class="block__title">Costume slots${Array.isArray(slots) ? ` · ${slots.length}` : ''}</h3>
      ${Array.isArray(slots) && slots.length ? slots.map((slot, position) => {
        const record = slot && typeof slot === 'object' && !Array.isArray(slot) ? slot : { value: slot };
        return `<details class="css-editor__slot"${position === 0 ? ' open' : ''}>
          <summary>Slot ${esc(valueText(record.slotIndex) ?? position)}</summary>
          ${fields(record)}
        </details>`;
      }).join('') : `<p class="prose">${Array.isArray(slots) ? 'No costume slots recorded.' : 'Costume slots not available in this dump.'}</p>`}
    </section>
  </div>`;
  setDialog(detail, `<div class="dialog__title"><span class="dialog__name">${esc(valueText(character.displayName) || valueText(character.id) || `Character ${Number(index) + 1}`)}</span></div>`, content, `
    <md-text-button data-action="copy" data-copy="${esc(JSON.stringify(character, null, 2))}"><md-icon slot="icon">content_copy</md-icon>Copy character</md-text-button>
    <md-filled-button data-action="close-dialog">Close</md-filled-button>`);
}

export function openModDialog(state, id) {
  const model = state.model;
  const mod = model.libraries.mods.items.find((entry) => entry.id === id);
  if (!mod) return;
  const rawPath = `$.libraries.mods.items[${mod.index}]`;
  const facts = defList([
    { label: 'Display name', value: mod.name },
    { label: 'Folder on disk', value: mod.folderName, mono: true, copy: true },
    { label: 'Status', value: mod.status },
    { label: 'Version', value: mod.version },
    { label: 'Author', value: mod.authors },
    { label: 'Category', value: mod.category },
    { label: 'Source record', value: mod.source.raw, mono: true, copy: true, hint: mod.source.kind === 'none' ? 'no reference recorded' : `${mod.source.kind} id ${mod.source.id || '—'} · url format ${mod.source.variant}` },
    { label: 'Position in dump', value: `entry ${formatNumber(mod.index + 1)} of ${formatNumber(model.libraries.mods.items.length)}` },
    mod.batch ? { label: 'Batch import', value: `timestamp ${mod.batch.timestamp}`, hint: `copy of “${mod.batchBase}”` } : null
  ]);
  const content = `
    <div class="detail">
      ${facts}
      <div class="detail__block">
        <h3 class="block__title">Signals</h3>
        ${flagList(mod, MOD_FLAGS)}
      </div>
      <div class="detail__block">
        <h3 class="block__title">Related entries</h3>
        ${siblingBlock(model, mod)}
      </div>
    </div>`;
  setDialog(detail, `
    <div class="dialog__title">
      <span class="dialog__name">${esc(mod.name)}</span>
      ${statusChip(mod.status)}
    </div>`, content, `
    <md-text-button data-action="copy" data-copy="${esc(mod.folderName)}"><md-icon slot="icon">content_copy</md-icon>Copy folder</md-text-button>
    <md-text-button data-action="open-raw" data-path="${esc(rawPath)}"><md-icon slot="icon">data_object</md-icon>Show in raw dump</md-text-button>
    <md-text-button data-action="filter-name" data-value="${esc(mod.name)}"><md-icon slot="icon">search</md-icon>Search this name</md-text-button>
    <md-filled-button data-action="close-dialog">Close</md-filled-button>`);
}

export function openPluginDialog(state, id) {
  const model = state.model;
  const plugin = model.libraries.plugins.items.find((entry) => entry.id === id);
  if (!plugin) return;
  const rawPath = `$.libraries.plugins.items[${plugin.index}]`;
  const content = `
    <div class="detail">
      ${defList([
        { label: 'File', value: plugin.name, mono: true },
        { label: 'Status', value: plugin.status },
        { label: 'Version', value: plugin.version, hint: plugin.versionLooksLikeFile ? 'this looks like the archive name' : null },
        { label: 'Size', value: plugin.size },
        { label: 'Repository', value: plugin.repository, mono: true },
        { label: 'Source record', value: plugin.source.raw, mono: true, copy: true }
      ])}
      <div class="detail__block">
        <h3 class="block__title">Signals</h3>
        ${flagList(plugin, PLUGIN_FLAGS)}
      </div>
    </div>`;
  setDialog(detail, `<div class="dialog__title"><span class="dialog__name value--mono">${esc(plugin.name)}</span>${statusChip(plugin.status)}</div>`, content, `
    <md-text-button data-action="open-raw" data-path="${esc(rawPath)}"><md-icon slot="icon">data_object</md-icon>Show in raw dump</md-text-button>
    <md-filled-button data-action="close-dialog">Close</md-filled-button>`);
}

export function openOtherFileDialog(state, id) {
  const entry = state.model.libraries.otherFiles.items.find((item) => item.id === id);
  if (!entry) return;
  const rawPath = `$.libraries.otherFiles.items[${entry.index}]`;
  setDialog(detail, `<div class="dialog__title"><span class="dialog__name value--mono">${esc(entry.name)}</span>${statusChip(entry.status)}</div>`,
    `<div class="detail">${defList([
      { label: 'Library', value: entry.library },
      { label: 'File', value: entry.name, mono: true },
      { label: 'Status', value: entry.status },
      { label: 'Relative path', value: entry.relativePath, mono: true, copy: true },
      { label: 'Size', value: formatBytes(entry.sizeBytes) },
      { label: 'Size in bytes', value: formatNumber(entry.sizeBytes) }
    ])}<div class="detail__block"><h3 class="block__title">Full record</h3><pre class="report__pre">${esc(JSON.stringify(entry.raw, null, 2))}</pre></div></div>`,
    `<md-text-button data-action="open-raw" data-path="${esc(rawPath)}">Show in raw dump</md-text-button><md-filled-button data-action="close-dialog">Close</md-filled-button>`);
}

export function closeDialog(element) {
  element.closest('md-dialog')?.close();
}

export function findingText(finding, model) {
  const lines = [
    `# ${finding.title}`,
    '',
    `- Severity: ${SEVERITY_LABEL[finding.severity]}`,
    `- Family: ${FAMILY_LABEL[finding.family] || finding.family}`,
    `- Check: ${finding.rule}`,
    `- Instances: ${formatNumber(finding.count)}`,
    `- Dump: ${model.fileName}${model.generatedAtMs !== null ? ` (${formatDateTime(model.generatedAtMs)}, ${formatRelative(model.generatedAtMs)})` : ''}`
  ];
  if (finding.summary) lines.push('', `**Summary** ${finding.summary}`);
  if (finding.why) lines.push('', `**Match rationale** ${finding.why}`);
  if (finding.impact) lines.push('', `**Possible relevance** ${finding.impact}`);
  if (finding.investigation) lines.push('', `**For the investigation** ${finding.investigation}`);
  if (finding.evidence?.length) {
    lines.push('', '**Supporting evidence**');
    for (const row of finding.evidence) lines.push(`- ${row.label}: ${row.value}`);
  }
  if (finding.subjects?.length) {
    lines.push('', `**Related entries (${finding.subjects.length})**`);
    for (const subject of finding.subjects.slice(0, 50)) lines.push(`- ${subject.label}${subject.detail && subject.detail !== subject.label ? ` — ${subject.detail}` : ''}`);
    if (finding.subjects.length > 50) lines.push(`- … ${finding.subjects.length - 50} more`);
  }
  return lines.join('\n');
}

export function environmentText(model) {
  return [
    `Application: ${[model.app.name, model.app.version, model.app.electron && `Electron ${model.app.electron}`, model.app.chrome && `Chrome ${model.app.chrome}`, model.app.node && `Node ${model.app.node}`].filter(Boolean).join(' · ')}`,
    `System: ${[model.system.platform, model.system.arch, model.system.osRelease, formatBytes(model.system.memory), model.system.cpuCount && `${model.system.cpuCount} cores`, model.system.locale && `locale ${model.system.locale}`].filter(Boolean).join(' · ')}`,
    `Mode: ${[model.configuration.runMode, model.configuration.emulatorType].filter(Boolean).join(' · ') || 'unknown'}`,
    `Mods path: ${model.configuration.modsPath || '—'}`,
    `Plugins path: ${model.configuration.pluginsPath || '—'}`,
    `Inventory: ${formatNumber(model.libraries.mods.items.length)} mods (${formatNumber(model.libraries.mods.counts.active)} active) · ${formatNumber(model.libraries.plugins.items.length)} plugins`,
    `Dump: ${model.fileName}${model.generatedAt ? ` generated ${model.generatedAt}` : ''}`
  ].join('\n');
}
