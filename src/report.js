import { FAMILY_LABEL } from './analysis.js';
import { SEVERITY_LABEL, formatBytes, formatDateTime, formatNumber, formatRelative, plural } from './model.js';

const cell = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  return String(value).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
};

const bullet = (label, value) => `${label}: ${value ?? '—'}`;

function libraryLine(model, key, label) {
  const library = model.libraries[key];
  const parts = [`${formatNumber(library.items.length)} listed`];
  if (library.counts.active) parts.push(`${formatNumber(library.counts.active)} active`);
  if (library.counts.disabled) parts.push(`${formatNumber(library.counts.disabled)} disabled`);
  if (library.counts.other) parts.push(`${formatNumber(library.counts.other)} unknown status`);
  parts.push(library.configured === null ? 'configured state not recorded' : library.configured ? 'library configured' : 'library not configured');
  return `- ${label}: ${parts.join(' · ')}`;
}

function findingsSection(findings) {
  const lines = [];
  if (!findings.length) {
    lines.push('No diagnostic signals detected by the current checks. This does not rule out an issue outside the available dump data.', '');
    return lines;
  }
  for (const finding of findings) {
    lines.push(`### [${SEVERITY_LABEL[finding.severity].toUpperCase()} SIGNAL] ${finding.title}`);
    lines.push('');
    lines.push(bullet('Family', FAMILY_LABEL[finding.family] || finding.family));
    lines.push(bullet('Count', `${formatNumber(finding.count)} ${plural(finding.count, 'instance')}`));
    if (finding.summary) lines.push(bullet('Summary', finding.summary));
    if (finding.why) lines.push(bullet('Match rationale', finding.why));
    if (finding.impact) lines.push(bullet('Possible relevance', finding.impact));
    if (finding.investigation) lines.push(bullet('For the investigation', finding.investigation));
    if (finding.evidence?.length) {
      lines.push(bullet('Supporting evidence', finding.evidence.map((row) => `${row.label} = ${row.value}`).join(' · ')));
    }
    if (finding.subjects?.length) {
      const shown = finding.subjects.slice(0, 25);
      lines.push('', `Related entries (${shown.length} of ${formatNumber(finding.subjects.length)}):`, '');
      for (const subject of shown) {
        lines.push(`- ${subject.label}${subject.detail && subject.detail !== subject.label ? ` — \`${subject.detail}\`` : ''}${subject.status ? ` (${subject.status})` : ''}`);
      }
      if (finding.subjects.length > shown.length) lines.push(`- … ${formatNumber(finding.subjects.length - shown.length)} more`);
    }
    lines.push('');
  }
  return lines;
}

function modsSection(model) {
  const items = model.libraries.mods.items;
  if (!items.length) return ['No mod entries in this dump.', ''];
  const lines = ['| Folder | Name | Status | Version | Author | Category | Source |', '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const mod of items) {
    lines.push(`| ${cell(mod.folderName)} | ${cell(mod.name)} | ${cell(mod.status)} | ${cell(mod.version)} | ${cell(mod.authors)} | ${cell(mod.category)} | ${cell(mod.source.raw)} |`);
  }
  lines.push('');
  return lines;
}

function pluginsSection(model) {
  const items = model.libraries.plugins.items;
  if (!items.length) return ['No plugin entries in this dump.', ''];
  const lines = ['| Plugin | Status | Version | Size | Repository | Source |', '| --- | --- | --- | --- | --- | --- |'];
  for (const plugin of items) {
    lines.push(`| ${cell(plugin.name)} | ${cell(plugin.status)} | ${cell(plugin.version)} | ${cell(plugin.size)} | ${cell(plugin.repository)} | ${cell(plugin.source.raw)} |`);
  }
  lines.push('');
  return lines;
}

export function buildReport(model, analysis, now = Date.now()) {
  const { findings, signals } = analysis;
  const lines = [];
  lines.push('# MOSAIC Debug triage report');
  lines.push('');
  lines.push(bullet('Dump', `\`${model.fileName}\``));
  if (model.generatedAtMs !== null) {
    lines.push(bullet('Generated', `${formatDateTime(model.generatedAtMs)} (${formatRelative(model.generatedAtMs, now)})`));
  } else {
    lines.push(bullet('Generated', model.generatedAt || 'not recorded'));
  }
  lines.push(bullet('Application', `${model.app.name || 'unknown'} ${model.app.version || ''}`.trim()));
  lines.push(bullet('Runtime', `Electron ${model.app.electron || '—'} · Chrome ${model.app.chrome || '—'} · Node ${model.app.node || '—'}`));
  lines.push(bullet('System', `${model.system.platform || '—'} · ${model.system.arch || '—'} · ${formatBytes(model.system.memory) || 'unknown RAM'} · ${formatNumber(model.system.cpuCount) || '?'} cores · locale ${model.system.locale || '—'}`));
  lines.push(bullet('Mode', `${model.configuration.runMode || '—'}${model.configuration.emulatorType ? ` (${model.configuration.emulatorType})` : ''}`));
  lines.push(bullet('Mods path', `\`${model.configuration.modsPath || '—'}\``));
  lines.push(bullet('Plugins path', `\`${model.configuration.pluginsPath || '—'}\``));
  lines.push(libraryLine(model, 'mods', 'Mods'));
  lines.push(libraryLine(model, 'plugins', 'Plugins'));
  lines.push('');
  lines.push('## Triage signal summary');
  lines.push('');
  lines.push(`${formatNumber(signals.total)} signals matched in this dump: ${formatNumber(signals.counts.critical)} high-impact, ${formatNumber(signals.counts.warning)} potential and ${formatNumber(signals.counts.info)} context notes.`);
  lines.push(`${formatNumber(signals.counts.ok)} checks did not match their conditions.`);
  lines.push('');
  lines.push('Automatic matches are investigation leads, not confirmed causes. Compare their evidence with the reported symptoms and other debugging information.');
  lines.push('');
  lines.push('## Signals');
  lines.push('');
  lines.push(...findingsSection(findings));
  lines.push('## Environment');
  lines.push('');
  lines.push('- Application: ' + [model.app.name, model.app.version, model.app.electron && `Electron ${model.app.electron}`, model.app.chrome && `Chrome ${model.app.chrome}`, model.app.node && `Node ${model.app.node}`].filter(Boolean).join(' · '));
  lines.push('- System: ' + [model.system.platform, model.system.arch, model.system.osRelease, formatBytes(model.system.memory), model.system.cpuCount && `${model.system.cpuCount} cores`, model.system.locale && `locale ${model.system.locale}`].filter(Boolean).join(' · '));
  lines.push('- Configuration: ' + [model.configuration.runMode, model.configuration.emulatorType].filter(Boolean).join(' · '));
  lines.push('');
  lines.push('## Mods');
  lines.push('');
  lines.push(...modsSection(model));
  lines.push('## Plugins');
  lines.push('');
  lines.push(...pluginsSection(model));
  if (model.notes.length) {
    lines.push('## Schema cautions');
    lines.push('');
    for (const note of model.notes) lines.push(`- [${note.level}] \`${note.path}\` — ${note.message}`);
    lines.push('');
  }
  lines.push('---');
  lines.push(`Prepared by MOSAIC Debug${model.schemaVersion !== null ? ` from schema v${model.schemaVersion}` : ''}.`);
  return lines.join('\n');
}

export function reportFileName(model) {
  const base = model.fileName.replace(/\.json$/i, '') || 'mosaic-debug';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `${base}-report-${stamp}.md`;
}
