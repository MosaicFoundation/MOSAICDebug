import { SEVERITY_RANK } from './model.js';

const MOD_FIELDS = [
  ['name', 'Name'],
  ['status', 'Status'],
  ['version', 'Version'],
  ['authors', 'Authors'],
  ['category', 'Category']
];

const PLUGIN_FIELDS = [
  ['status', 'Status'],
  ['version', 'Version'],
  ['size', 'Size'],
  ['repository', 'Repository']
];

const CONFIG_FIELDS = [
  ['runMode', 'Run mode'],
  ['emulatorType', 'Emulator'],
  ['modsPath', 'Mods path'],
  ['pluginsPath', 'Plugins path']
];

const APP_FIELDS = [
  ['name', 'Application'],
  ['version', 'Version'],
  ['electron', 'Electron'],
  ['chrome', 'Chrome'],
  ['node', 'Node']
];

const SYSTEM_FIELDS = [
  ['platform', 'Platform'],
  ['arch', 'Architecture'],
  ['osRelease', 'OS release'],
  ['memory', 'Total memory'],
  ['cpuCount', 'CPU cores'],
  ['locale', 'Locale']
];

const valueOf = (entry, field) => {
  if (field === 'sourceUrl') return entry.source?.raw ?? null;
  return entry[field] ?? null;
};

function compareEntries(baseItems, nextItems, keyOf, labelOf, fields) {
  const baseMap = new Map();
  const nextMap = new Map();
  for (const item of baseItems) baseMap.set(keyOf(item), item);
  for (const item of nextItems) nextMap.set(keyOf(item), item);

  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];
  for (const [key, item] of nextMap) {
    if (!baseMap.has(key)) {
      added.push(item);
      continue;
    }
    const before = baseMap.get(key);
    const fieldChanges = [];
    for (const [field, label] of [...fields, ['sourceUrl', 'Source URL']]) {
      const from = valueOf(before, field);
      const to = valueOf(item, field);
      if (from !== to) fieldChanges.push({ field, label, before: from, after: to });
    }
    if (fieldChanges.length) changed.push({ key, label: labelOf(item), before, after: item, fields: fieldChanges });
    else unchanged.push(item);
  }
  for (const [key, item] of baseMap) {
    if (!nextMap.has(key)) removed.push(item);
  }
  return { added, removed, changed, unchanged };
}

function compareBlock(base, next, fields) {
  return fields
    .map(([field, label]) => ({ field, label, before: base[field] ?? null, after: next[field] ?? null }))
    .filter((row) => row.before !== row.after);
}

function findExtras(base, next) {
  const rows = [];
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(next || {})]);
  for (const key of keys) {
    const before = base?.[key];
    const after = next?.[key];
    if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) {
      rows.push({ field: key, label: key, before: before ?? null, after: after ?? null });
    }
  }
  return rows;
}

function aggregateFindings(findings) {
  const map = new Map();
  for (const finding of findings) {
    const current = map.get(finding.rule);
    if (!current) map.set(finding.rule, { rule: finding.rule, title: finding.title, severity: finding.severity, count: finding.count, family: finding.family });
    else {
      current.count += finding.count;
      if (SEVERITY_RANK[finding.severity] < SEVERITY_RANK[current.severity]) current.severity = finding.severity;
      if (!current.title || finding.title.length < current.title.length) current.title = finding.title;
    }
  }
  return map;
}

function diffFindings(baseFindings, nextFindings) {
  const baseMap = aggregateFindings(baseFindings);
  const nextMap = aggregateFindings(nextFindings);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [rule, next] of nextMap) {
    const base = baseMap.get(rule);
    if (!base) { added.push(next); continue; }
    if (base.count !== next.count || base.severity !== next.severity) {
      changed.push({ ...next, before: base.count, beforeSeverity: base.severity });
    }
  }
  for (const [rule, base] of baseMap) if (!nextMap.has(rule)) removed.push(base);
  return { added, removed, changed };
}

export function diffDumps(base, next, baseAnalysis, nextAnalysis) {
  const mods = compareEntries(
    base.libraries.mods.items,
    next.libraries.mods.items,
    (mod) => mod.folderName.trim().toLowerCase(),
    (mod) => mod.name,
    MOD_FIELDS
  );
  const plugins = compareEntries(
    base.libraries.plugins.items,
    next.libraries.plugins.items,
    (plugin) => plugin.slug,
    (plugin) => plugin.name,
    PLUGIN_FIELDS
  );
  const config = [
    ...compareBlock(base.configuration, next.configuration, CONFIG_FIELDS),
    ...findExtras(base.configuration.extra, next.configuration.extra)
  ];
  const app = [...compareBlock(base.app, next.app, APP_FIELDS), ...findExtras(base.app.extra, next.app.extra)];
  const system = [...compareBlock(base.system, next.system, SYSTEM_FIELDS), ...findExtras(base.system.extra, next.system.extra)];
  const findings = diffFindings(baseAnalysis.findings, nextAnalysis.findings);

  const buildTime = base.generatedAtMs !== null && next.generatedAtMs !== null ? next.generatedAtMs - base.generatedAtMs : null;

  return {
    base,
    next,
    buildTime,
    mods,
    plugins,
    config,
    app,
    system,
    findings,
    summary: {
      mods: {
        added: mods.added.length,
        removed: mods.removed.length,
        changed: mods.changed.length,
        base: base.libraries.mods.items.length,
        next: next.libraries.mods.items.length
      },
      plugins: {
        added: plugins.added.length,
        removed: plugins.removed.length,
        changed: plugins.changed.length,
        base: base.libraries.plugins.items.length,
        next: next.libraries.plugins.items.length
      },
      config: config.length,
      environment: app.length + system.length,
      findings: {
        new: findings.added.length,
        resolved: findings.removed.length,
        changed: findings.changed.length,
        baseSignals: baseAnalysis.signals.counts.critical + baseAnalysis.signals.counts.warning + baseAnalysis.signals.counts.info,
        nextSignals: nextAnalysis.signals.counts.critical + nextAnalysis.signals.counts.warning + nextAnalysis.signals.counts.info
      }
    }
  };
}

export function isEmptyDiff(diff) {
  const { summary } = diff;
  return summary.mods.added + summary.mods.removed + summary.mods.changed === 0
    && summary.plugins.added + summary.plugins.removed + summary.plugins.changed === 0
    && summary.config === 0
    && summary.environment === 0
    && summary.findings.new + summary.findings.resolved + summary.findings.changed === 0;
}
