import { SEVERITY_RANK } from './model.js';

export const MOD_FLAGS = [
  { id: 'batch-duplicate', label: 'Batch copies', icon: 'folder_copy', hint: 'Folder created by a repeated batch import' },
  { id: 'duplicate-name', label: 'Name used twice', icon: 'file_copy', hint: 'Another folder shows the same mod name' },
  { id: 'folder-collision', label: 'Folder collision', icon: 'folder_off', hint: 'Name collides after normalising spaces, dots or case' },
  { id: 'auto-named', label: 'Auto-named', icon: 'schedule', hint: 'Named after its install timestamp' },
  { id: 'no-metadata', label: 'No metadata', icon: 'label_off', hint: 'No version, author and category' },
  { id: 'no-source', label: 'No source URL', icon: 'public_off', hint: 'No GameBanana reference recorded' },
  { id: 'orphan-copy', label: 'Orphan copy', icon: 'folder_delete', hint: 'Batch copy whose original folder is gone' }
];

export const PLUGIN_FLAGS = [
  { id: 'duplicate-plugin', label: 'Loaded twice', icon: 'content_copy', hint: 'Two files with the same plugin name' },
  { id: 'version-file', label: 'Version is a file name', icon: 'description', hint: 'The archive name landed in the version field' },
  { id: 'no-repository', label: 'No repository', icon: 'hub', hint: 'Update checks cannot run' },
  { id: 'no-source', label: 'No source URL', icon: 'public_off', hint: 'No link recorded' }
];

export const SORTS = [
  { id: 'index', label: 'Dump order' },
  { id: 'name', label: 'Name' },
  { id: 'folder', label: 'Folder' },
  { id: 'status', label: 'Status' },
  { id: 'category', label: 'Category' },
  { id: 'version', label: 'Version' },
  { id: 'author', label: 'Author' }
];

const normalize = (value) => String(value ?? '').toLowerCase();

export function queryMatches(entry, query) {
  if (!query) return true;
  const needle = normalize(query).trim();
  if (!needle) return true;
  const haystack = entry.kind === 'plugin'
    ? [entry.name, entry.version, entry.repository, entry.size, entry.source.raw, entry.status]
    : [entry.name, entry.folderName, entry.authors, entry.category, entry.version, entry.source.raw, entry.status];
  return haystack.some((value) => normalize(value).includes(needle));
}

export function parseList(value) {
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

export function toggleInList(value, item) {
  const list = parseList(value);
  const next = list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
  return next.join(',');
}

export function focusInfo(state, kind) {
  const id = state.params.focus;
  if (!id) return { finding: null, ids: null };
  const source = state.view === 'compare' ? state.analysis.findings : state.analysis.findings;
  const finding = source.find((entry) => entry.id === id) || null;
  if (!finding) return { finding: null, ids: null };
  const ids = new Set(finding.subjects.filter((subject) => subject.type === kind).map((subject) => subject.id));
  return { finding, ids: ids.size ? ids : null };
}

export function filterEntries(state, kind) {
  const library = kind === 'plugin' ? state.model.libraries.plugins : state.model.libraries.mods;
  const params = state.params;
  const query = params.q || '';
  const status = params.status || 'all';
  const flags = parseList(params.flags);
  const category = params.category || null;
  const { finding, ids } = focusInfo(state, kind);
  const sort = params.sort || 'index';
  const dir = params.dir === 'desc' ? -1 : 1;

  let items = library.items.slice();
  if (ids) items = items.filter((entry) => ids.has(entry.id));
  if (query) items = items.filter((entry) => queryMatches(entry, query));
  if (status !== 'all') {
    items = items.filter((entry) => (status === 'other' ? entry.status !== 'active' && entry.status !== 'disabled' : entry.status === status));
  }
  if (category) {
    items = items.filter((entry) => (category === '(none)' ? !entry.category : entry.category === category));
  }
  for (const flag of flags) items = items.filter((entry) => entry.flags?.has(flag));

  const value = (entry) => {
    switch (sort) {
      case 'name': return normalize(entry.name);
      case 'folder': return normalize(entry.folderName || entry.name);
      case 'status': return normalize(entry.status);
      case 'category': return normalize(entry.category);
      case 'version': return normalize(entry.version);
      case 'author': return normalize(entry.authors);
      default: return entry.index;
    }
  };
  items.sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === right) return a.index - b.index;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
    return String(left).localeCompare(String(right)) * dir;
  });
  return { items, total: library.items.length, finding, hasFocus: Boolean(ids) };
}

export function filterFindings(state) {
  const params = state.params;
  const severities = parseList(params.sev);
  const families = parseList(params.family);
  const query = normalize(params.q).trim();
  const sort = params.sort || 'severity';

  let findings = state.analysis.findings.slice();
  if (severities.length) findings = findings.filter((finding) => severities.includes(finding.severity));
  if (families.length) findings = findings.filter((finding) => families.includes(finding.family));
  if (query) {
    findings = findings.filter((finding) => [finding.title, finding.summary, finding.why, finding.impact, finding.rule, ...finding.evidence.map((row) => row.value)]
      .some((value) => normalize(value).includes(query)));
  }
  if (sort === 'count') findings.sort((a, b) => b.count - a.count);
  else if (sort === 'family') findings.sort((a, b) => a.family.localeCompare(b.family) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  else if (sort === 'name') findings.sort((a, b) => a.title.localeCompare(b.title));
  else findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count);
  return findings;
}

export function activeFilterCount(state) {
  const params = state.params;
  let count = 0;
  if (params.q) count += 1;
  if (params.status && params.status !== 'all') count += 1;
  if (params.category) count += 1;
  count += parseList(params.flags).length;
  count += parseList(params.sev).length;
  count += parseList(params.family).length;
  return count;
}

export function rawSearchEntries(raw, query, limit = 300) {
  const needle = normalize(query).trim();
  if (!needle) return [];
  const results = [];
  const walk = (value, path, key) => {
    if (results.length >= limit) return;
    if (value === null || typeof value !== 'object') {
      const text = normalize(value);
      if (text.includes(needle) || normalize(key).includes(needle) || normalize(path).includes(needle)) {
        results.push({ path, key, value });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => walk(child, `${path}[${index}]`, String(index)));
      return;
    }
    for (const [childKey, child] of Object.entries(value)) walk(child, `${path}.${childKey}`, childKey);
  };
  walk(raw, '$', '$');
  return results;
}
