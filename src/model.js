export const SEVERITIES = ['critical', 'warning', 'info', 'ok'];
export const SEVERITY_RANK = { critical: 0, warning: 1, info: 2, ok: 3 };
export const SEVERITY_LABEL = { critical: 'High-impact signal', warning: 'Potential signal', info: 'Context', ok: 'No match' };

const BATCH_RE = /\.fpp-batch-duplicate-(\d{10,})_[a-z0-9]+_(.*)$/i;
const AUTO_NAME_RE = /^mod-\d{9,}$/i;

export const CORE_PLUGINS = [
  { key: 'libarcropolis', label: 'ARCropolis', need: 'required', why: 'loads mods from the SD card and patches the game file table' },
  { key: 'libsmashline', label: 'Smashline', need: 'recommended', why: 'runs C# moveset and fighter plugins' },
  { key: 'libnro_hook', label: 'NRO Hook', need: 'recommended', why: 'lets Skyline plugins hook the game at runtime' },
  { key: 'libparam_hook', label: 'Param Hook', need: 'recommended', why: 'applies param edits such as moveset and camera changes' },
  { key: 'libparam_config', label: 'Param Config', need: 'optional', why: 'per-mod param configuration UI' }
];

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const text = (value) => {
  if (value === null || value === undefined) return null;
  const out = String(value).replace(/\s+/g, ' ').trim();
  return out.length ? out : null;
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const asNumber = (value) => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
};

const extraKeys = (source, used) => {
  if (!isObject(source)) return {};
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (!used.includes(key)) out[key] = value;
  }
  return out;
};

export function parseSource(raw) {
  const value = text(raw);
  if (!value) return { raw: null, kind: 'none', id: null, host: null, variant: null, key: null };
  let host = null;
  try { host = new URL(value).host; } catch { host = null; }
  const download = value.match(/\/mmdl\/(\d+)/);
  const page = value.match(/\/mods\/(\d+)/);
  const tracked = value.match(/,Mod,(\d+)/);
  let kind = 'other';
  let id = null;
  if (download) { kind = 'download'; id = download[1]; }
  else if (page) { kind = 'page'; id = page[1]; }
  else if (tracked) { kind = 'tracked'; id = tracked[1]; }
  const variant = value.includes('?toolid=') ? 'query' : value.includes(',Mod,') ? 'csv' : 'plain';
  const key = id && kind !== 'tracked' ? `${kind}:${id}` : null;
  return { raw: value, kind, id, host, variant, key };
}

function normalizeMod(item, index) {
  const source = parseSource(item?.sourceUrl);
  const folderName = text(item?.folderName);
  const name = text(item?.name) || folderName || `entry #${index + 1}`;
  const batch = folderName ? folderName.match(BATCH_RE) : null;
  return {
    kind: 'mod',
    id: `mod:${index}`,
    index,
    name,
    folderName: folderName || name,
    status: text(item?.status),
    version: text(item?.version),
    authors: text(item?.authors),
    category: text(item?.category),
    source,
    batch: batch ? { timestamp: Number(batch[1]), suffix: batch[2] } : null,
    batchBase: batch && folderName ? folderName.slice(0, folderName.indexOf('.fpp-batch-duplicate-')) : null,
    autoNamed: AUTO_NAME_RE.test(name),
    nameMatchesFolder: Boolean(folderName) && name === folderName,
    flagged: item?.flagged === true,
    raw: item
  };
}

function normalizePlugin(item, index) {
  const source = parseSource(item?.sourceUrl);
  const name = text(item?.name) || `plugin-${index + 1}`;
  const version = text(item?.version);
  return {
    kind: 'plugin',
    id: `plugin:${index}`,
    index,
    name,
    status: text(item?.status),
    version,
    versionLooksLikeFile: Boolean(version) && /\.(zip|7z|rar|nro)/i.test(version),
    size: text(item?.size),
    repository: text(item?.repository),
    source,
    slug: name.toLowerCase().replace(/\.nro$/, ''),
    autoNamed: AUTO_NAME_RE.test(name),
    raw: item
  };
}

function normalizeLibrary(section, notes, label, mapper) {
  const present = isObject(section);
  if (!present) {
    notes.push({ level: 'warning', path: `libraries.${label}`, message: `The ${label} section is missing from this dump.` });
    return { present: false, configured: null, activeCount: null, disabledCount: null, scanError: null, items: [], counts: { active: 0, disabled: 0, other: 0 } };
  }
  const items = Array.isArray(section.items)
    ? section.items.map(mapper)
    : isObject(section.items)
      ? Object.values(section.items).map(mapper)
      : [];
  if (!Array.isArray(section.items) && !isObject(section.items)) {
    notes.push({ level: 'warning', path: `libraries.${label}.items`, message: `Expected items to be a list, found ${section.items === undefined ? 'nothing' : typeof section.items}.` });
  }
  const counts = { active: 0, disabled: 0, other: 0 };
  for (const entry of items) {
    if (entry.status === 'active') counts.active += 1;
    else if (entry.status === 'disabled') counts.disabled += 1;
    else counts.other += 1;
  }
  return {
    present: true,
    configured: section.configured === undefined ? null : Boolean(section.configured),
    activeCount: asNumber(section.activeCount),
    disabledCount: asNumber(section.disabledCount),
    scanError: text(section.scanError) || (section.scanError ? String(section.scanError) : null),
    items,
    counts,
    extra: extraKeys(section, ['configured', 'activeCount', 'disabledCount', 'scanError', 'items'])
  };
}

function normalizeOtherFiles(section, notes) {
  const items = asArray(section?.items).map((item, index) => ({
    kind: 'other-file', id: `other-file:${index}`, index,
    library: text(item?.library), status: text(item?.status),
    name: text(item?.name) || text(item?.relativePath) || `file-${index + 1}`,
    relativePath: text(item?.relativePath), sizeBytes: asNumber(item?.sizeBytes), raw: item
  }));
  if (section != null && (!isObject(section) || !Array.isArray(section.items))) {
    notes.push({ level: 'warning', path: 'libraries.otherFiles.items', message: 'Expected other files to be a list.' });
  }
  return { count: asNumber(section?.count), items };
}

export function normalizeDump(raw, fileName) {
  const notes = [];
  if (!isObject(raw)) {
    notes.push({ level: 'critical', path: '$', message: 'The file is not a JSON object, so no section could be read.' });
    return {
      fileName, raw, schemaVersion: null, generatedAt: null, generatedAtMs: null,
      app: { name: null, version: null, extra: {} },
      system: { platform: null, arch: null, osRelease: null, memory: null, cpuCount: null, locale: null, extra: {} },
      configuration: { runMode: null, emulatorType: null, modsPath: null, pluginsPath: null, extra: {} },
      libraries: {
        mods: normalizeLibrary(null, [], 'mods', normalizeMod),
        plugins: normalizeLibrary(null, [], 'plugins', normalizePlugin),
        otherFiles: normalizeOtherFiles(null, [])
      },
      notes
    };
  }

  const app = isObject(raw.app) ? raw.app : {};
  const system = isObject(raw.system) ? raw.system : {};
  const configuration = isObject(raw.configuration) ? raw.configuration : {};
  const libraries = isObject(raw.libraries) ? raw.libraries : {};

  if (!isObject(raw.app)) notes.push({ level: 'warning', path: 'app', message: 'No application block: the report cannot name the build that produced it.' });
  if (!isObject(raw.system)) notes.push({ level: 'info', path: 'system', message: 'No system block: hardware and OS details are unavailable.' });
  if (!isObject(raw.configuration)) notes.push({ level: 'critical', path: 'configuration', message: 'No configuration block: run mode and library paths are unknown.' });
  if (!isObject(raw.libraries)) notes.push({ level: 'critical', path: 'libraries', message: 'No libraries block: the dump contains no mod or plugin inventory.' });
  if (raw.schemaVersion === undefined) notes.push({ level: 'warning', path: 'schemaVersion', message: 'Missing schemaVersion: this reader assumes the v1 layout.' });
  else if (asNumber(raw.schemaVersion) !== 1) notes.push({ level: 'warning', path: 'schemaVersion', message: `Unknown schema version ${raw.schemaVersion}: some fields may be ignored.` });
  if (!text(raw.generatedAt)) notes.push({ level: 'info', path: 'generatedAt', message: 'No generation timestamp: staleness cannot be judged.' });

  const generatedAt = text(raw.generatedAt);
  const parsedDate = generatedAt ? Date.parse(generatedAt) : NaN;

  const model = {
    fileName,
    raw,
    schemaVersion: asNumber(raw.schemaVersion),
    generatedAt,
    generatedAtMs: Number.isFinite(parsedDate) ? parsedDate : null,
    app: {
      name: text(app.name),
      version: text(app.version),
      electron: text(app.electronVersion),
      chrome: text(app.chromeVersion),
      node: text(app.nodeVersion),
      extra: extraKeys(app, ['name', 'version', 'electronVersion', 'chromeVersion', 'nodeVersion'])
    },
    system: {
      platform: text(system.platform),
      arch: text(system.architecture),
      osRelease: text(system.osRelease),
      memory: asNumber(system.totalMemoryBytes),
      cpuCount: asNumber(system.cpuCount),
      locale: text(system.locale),
      extra: extraKeys(system, ['platform', 'architecture', 'osRelease', 'totalMemoryBytes', 'cpuCount', 'locale'])
    },
    configuration: {
      runMode: text(configuration.runMode),
      emulatorType: text(configuration.emulatorType),
      modsPath: text(configuration.modsPath),
      pluginsPath: text(configuration.pluginsPath),
      extra: extraKeys(configuration, ['runMode', 'emulatorType', 'modsPath', 'pluginsPath'])
    },
    libraries: {
      mods: normalizeLibrary(libraries.mods, notes, 'mods', normalizeMod),
      plugins: normalizeLibrary(libraries.plugins, notes, 'plugins', normalizePlugin),
      otherFiles: normalizeOtherFiles(libraries.otherFiles, notes)
    },
    notes
  };

  return model;
}

export function analyzeModel(model) {
  const mods = model.libraries.mods.items;
  const plugins = model.libraries.plugins.items;

  const folderMap = new Map();
  const nameMap = new Map();
  for (const mod of mods) {
    mod.flags = new Set();
    const folderKey = mod.folderName.trim().toLowerCase();
    const nameKey = mod.name.trim().toLowerCase();
    if (!folderMap.has(folderKey)) folderMap.set(folderKey, []);
    folderMap.get(folderKey).push(mod);
    if (!nameMap.has(nameKey)) nameMap.set(nameKey, []);
    nameMap.get(nameKey).push(mod);
  }

  const looseFolderMap = new Map();
  for (const mod of mods) {
    const loose = mod.folderName.trim().toLowerCase().replace(/[\s._-]+/g, '');
    if (!looseFolderMap.has(loose)) looseFolderMap.set(loose, []);
    looseFolderMap.get(loose).push(mod);
  }

  const batchGroups = new Map();
  for (const mod of mods) {
    if (!mod.batch) continue;
    const key = mod.batchBase.trim().toLowerCase();
    if (!batchGroups.has(key)) batchGroups.set(key, []);
    batchGroups.get(key).push(mod);
  }

  const knownFolders = new Set(mods.map((mod) => mod.folderName.trim().toLowerCase()));
  for (const mod of mods) {
    if (mod.batch) {
      mod.flags.add('batch-duplicate');
      if (!knownFolders.has(mod.batchBase.trim().toLowerCase())) mod.flags.add('orphan-copy');
    }
    if (mod.autoNamed) mod.flags.add('auto-named');
    if (!mod.version && !mod.authors && !mod.category) mod.flags.add('no-metadata');
    if (!mod.version) mod.flags.add('no-version');
    if (!mod.authors) mod.flags.add('no-author');
    if (!mod.category) mod.flags.add('no-category');
    if (!mod.source.raw) mod.flags.add('no-source');
    if (mod.status === 'active') mod.flags.add('active');
    if (mod.status !== 'active' && mod.status !== 'disabled') mod.flags.add('bad-status');
    if ((folderMap.get(mod.folderName.trim().toLowerCase()) || []).length > 1) mod.flags.add('duplicate-folder');
    if ((looseFolderMap.get(mod.folderName.trim().toLowerCase().replace(/[\s._-]+/g, '')) || []).length > 1) mod.flags.add('folder-collision');
    if ((nameMap.get(mod.name.trim().toLowerCase()) || []).length > 1) mod.flags.add('duplicate-name');
  }

  const pluginNames = new Map();
  for (const plugin of plugins) {
    const key = plugin.slug;
    if (!pluginNames.has(key)) pluginNames.set(key, []);
    pluginNames.get(key).push(plugin);
    plugin.flags = new Set();
    if (plugin.status === 'active') plugin.flags.add('active');
    if (plugin.status !== 'active' && plugin.status !== 'disabled') plugin.flags.add('bad-status');
    if (plugin.versionLooksLikeFile) plugin.flags.add('version-file');
    if (!plugin.repository) plugin.flags.add('no-repository');
    if (!plugin.source.raw) plugin.flags.add('no-source');
    if (!plugin.version) plugin.flags.add('no-version');
  }
  for (const plugin of plugins) {
    if ((pluginNames.get(plugin.slug) || []).length > 1) plugin.flags.add('duplicate-plugin');
  }

  const categories = new Map();
  for (const mod of mods) {
    const key = mod.category || '(none)';
    categories.set(key, (categories.get(key) || 0) + 1);
  }

  model.index = { folderMap, nameMap, batchGroups, looseFolderMap, categories, pluginNames };
  return model;
}

export function siblingGroups(model, mod) {
  const out = [];
  const sameName = model.index.nameMap.get(mod.name.trim().toLowerCase()) || [];
  if (sameName.length > 1) {
    out.push({
      label: 'Same mod name',
      reason: 'Another folder carries the same name.',
      items: sameName.filter((entry) => entry.id !== mod.id)
    });
  }
  if (mod.batch) {
    const base = model.index.batchGroups.get(mod.batchBase.trim().toLowerCase()) || [];
    const original = model.libraries.mods.items.find((entry) => entry.folderName.trim().toLowerCase() === mod.batchBase.trim().toLowerCase());
    const items = base.filter((entry) => entry.id !== mod.id);
    if (original && original.id !== mod.id) items.push(original);
    out.push({
      label: 'Batch copies',
      reason: 'Copies created by the same batch import.',
      items
    });
  }
  const sameFolder = model.index.folderMap.get(mod.folderName.trim().toLowerCase()) || [];
  if (sameFolder.length > 1) {
    out.push({
      label: 'Same folder name',
      reason: 'Two entries point at one folder name on disk.',
      items: sameFolder.filter((entry) => entry.id !== mod.id)
    });
  }
  return out.filter((group) => group.items.length);
}

const byteUnits = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes, digits = 2) {
  const value = asNumber(bytes);
  if (value === null) return null;
  let size = Math.abs(value);
  let unit = 0;
  while (size >= 1024 && unit < byteUnits.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const fixed = unit === 0 ? String(Math.round(size)) : size.toFixed(digits);
  return `${value < 0 ? '-' : ''}${fixed} ${byteUnits[unit]}`;
}

export function formatNumber(value) {
  const n = asNumber(value);
  if (n === null) return null;
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatDateTime(ms) {
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${day} · ${time}`;
}

export function formatRelative(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return null;
  const delta = Math.round((now - ms) / 1000);
  const future = delta < 0;
  const abs = Math.abs(delta);
  const units = [
    [60, 'second', 1],
    [3600, 'minute', 60],
    [86400, 'hour', 3600],
    [2592000, 'day', 86400],
    [31536000, 'month', 2592000],
    [Infinity, 'year', 31536000]
  ];
  for (const [limit, unit, divisor] of units) {
    if (abs < limit) {
      const count = Math.max(1, Math.floor(abs / divisor));
      return `${count} ${unit}${count === 1 ? '' : 's'} ${future ? 'from now' : 'ago'}`;
    }
  }
  return null;
}

export function plural(count, singular, pluralForm) {
  return count === 1 ? singular : pluralForm || `${singular}s`;
}

export function pathTraits(value) {
  if (!value) return [];
  const traits = [];
  if (/^\s|\s$/.test(value)) traits.push('leading or trailing whitespace');
  if (value.includes('\\\\') || value.includes('//')) traits.push('repeated separators');
  if (/[^\x20-\x7E]/.test(value)) traits.push('non-ASCII characters');
  if (!/^[A-Za-z]:[\\/]/.test(value) && !value.startsWith('/')) traits.push('not an absolute path');
  if (value.length > 240) traits.push('very long path');
  return traits;
}

export function basename(value) {
  if (!value) return null;
  return value.split(/[\\/]/).filter(Boolean).pop() || null;
}

export function dirname(value) {
  if (!value) return null;
  const parts = value.split(/[\\/]/).filter(Boolean);
  parts.pop();
  return parts.join('\\') || null;
}
