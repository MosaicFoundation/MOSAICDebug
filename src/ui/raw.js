import { formatNumber } from '../model.js';
import { rawSearchEntries } from '../filters.js';
import { emptyState, esc, icon } from './pieces.js';
import { searchField, toolbar } from './controls.js';

const MAX_ROWS = 4000;

function valueClass(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  return 'object';
}

function renderValue(value) {
  if (value === null) return '<span class="json-value json-value--null">null</span>';
  if (typeof value === 'string') {
    const short = value.length > 220 ? `${value.slice(0, 220)}…` : value;
    return `<span class="json-value json-value--string" title="${esc(value)}">"${esc(short)}"</span>`;
  }
  if (typeof value === 'number') return `<span class="json-value json-value--number">${esc(value)}</span>`;
  if (typeof value === 'boolean') return `<span class="json-value json-value--boolean">${esc(value)}</span>`;
  return `<span class="json-value json-value--object">${esc(JSON.stringify(value))}</span>`;
}

function nodeCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function ancestorsOf(path) {
  const tokens = path.replace(/^\$/, '').match(/\.[^.[\]]+|\[\d+\]/g) || [];
  const out = ['$'];
  let current = '$';
  for (const token of tokens) {
    current += token;
    out.push(current);
  }
  return out;
}

function renderNode(key, value, path, depth, openSet, rows, matched) {
  if (rows.count > MAX_ROWS) return '';
  const isContainer = value !== null && typeof value === 'object';
  const open = openSet.has(path);
  const label = key === null ? '$' : key;
  const count = isContainer ? nodeCount(value) : 0;
  const isMatch = matched.has(path);
  rows.count += 1;

  const row = `<div class="node node--${esc(valueClass(value))}${isMatch ? ' node--hit' : ''}" data-path="${esc(path)}" style="--depth:${depth}">
    ${isContainer
      ? `<button class="node__toggle" type="button" data-action="toggle-node" data-path="${esc(path)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(label)}">${icon(open ? 'expand_more' : 'chevron_right')}</button>`
      : '<span class="node__toggle node__toggle--leaf"></span>'}
    <span class="node__key">${esc(label)}</span>
    <span class="node__colon">:</span>
    ${isContainer
      ? `<span class="node__summary">${Array.isArray(value) ? 'array' : 'object'} · ${formatNumber(count)} ${count === 1 ? 'entry' : 'entries'}</span>`
      : renderValue(value)}
    <span class="node__actions">
      ${!isContainer ? `<button class="icon-action" type="button" data-action="copy" data-copy="${esc(value === null ? 'null' : String(value))}" title="Copy value" aria-label="Copy value">${icon('content_copy')}</button>` : ''}
      <button class="icon-action" type="button" data-action="copy" data-copy="${esc(path)}" title="Copy path" aria-label="Copy path">${icon('route')}</button>
    </span>
  </div>`;

  if (!isContainer || !open) return row;
  let children = '';
  const entries = Array.isArray(value) ? value.map((child, index) => [String(index), child]) : Object.entries(value);
  for (const [childKey, child] of entries) {
    const childPath = Array.isArray(value) ? `${path}[${childKey}]` : `${path}.${childKey}`;
    children += renderNode(childKey, child, childPath, depth + 1, openSet, rows, matched);
  }
  return `${row}<div class="node__children">${children}</div>`;
}

export function renderRaw(state) {
  const query = state.params.q || '';
  const openParam = state.params.open || '';
  const openSet = new Set(openParam ? openParam.split(',').filter(Boolean) : ['$']);
  const focusPath = state.params.path || null;
  const results = query ? rawSearchEntries(state.model.raw, query, 200) : [];
  const matched = new Set(results.map((entry) => entry.path));
  if (focusPath) for (const path of ancestorsOf(focusPath)) openSet.add(path);
  if (results.length && results.length <= 40) for (const entry of results) for (const path of ancestorsOf(entry.path)) openSet.add(path);
  if (!openParam && !query && !focusPath) {
    openSet.add('$');
    for (const key of ['app', 'system', 'configuration', 'libraries']) openSet.add(`$.${key}`);
  }

  const rows = { count: 0 };
  const tree = renderNode(null, state.model.raw, '$', 0, openSet, rows, query ? matched : new Set());

  const resultsBlock = query
    ? (results.length
      ? `<div class="raw-results">
          <p class="raw-results__head">${formatNumber(results.length)} ${results.length === 1 ? 'match' : 'matches'} for “${esc(query)}”</p>
          <ul class="raw-results__list">
            ${results.slice(0, 80).map((entry) => `<li>
              <button class="raw-result" type="button" data-action="open-path" data-path="${esc(entry.path)}">
                <span class="raw-result__path value--mono">${esc(entry.path)}</span>
                <span class="raw-result__value value--mono">${esc(entry.value === null ? 'null' : String(entry.value).slice(0, 160))}</span>
              </button>
            </li>`).join('')}
          </ul>
          ${results.length > 80 ? `<p class="hint">Showing the first 80 matches.</p>` : ''}
        </div>`
      : emptyState({ iconName: 'search_off', title: 'No match in this dump', body: `Nothing in the JSON matches “${esc(query)}”. Try a folder name, a version number or a path fragment.` }))
    : '';

  return `<div class="view view--raw">
    <header class="view__head">
      <div>
        <h1 class="view__title">Raw dump</h1>
        <p class="view__sub">The parsed file exactly as it was written. Search across every key and value, copy any path, or jump a check straight to its field.</p>
      </div>
      <div class="view__actions">
        <md-text-button data-action="toggle-all-nodes" data-value="1">${icon('unfold_more')}Expand all</md-text-button>
        <md-text-button data-action="download-json">${icon('download')}Download</md-text-button>
        <md-text-button data-action="copy-json">${icon('content_copy')}Copy JSON</md-text-button>
      </div>
    </header>
    ${toolbar({
      leading: searchField({ value: query, label: 'Search the JSON', placeholder: 'folder name, path, value…' }),
      trailing: `<span class="hint">${formatNumber(rows.count)} nodes shown</span>`
    })}
    ${resultsBlock}
    ${focusPath ? `<div class="focus-banner">${icon('route')}<span class="focus-banner__text">Jumped to <span class="value--mono">${esc(focusPath)}</span></span>
      <button class="text-link" type="button" data-action="clear-path">${icon('close')}Back to the top</button></div>` : ''}
    <div class="json-tree">${tree}</div>
    ${rows.count > MAX_ROWS ? `<p class="hint">The tree stopped rendering after ${formatNumber(MAX_ROWS)} rows. Use search to reach a specific field.</p>` : ''}
  </div>`;
}
