import { formatBytes, formatNumber, plural } from '../model.js';
import { MOD_FLAGS, PLUGIN_FLAGS, filterEntries, parseList } from '../filters.js';
import { clearFiltersButton, flagChips, focusBanner, resultCount, searchField, sortSelect, statusChips, toolbar } from './controls.js';
import { emptyState, esc, icon, statusChip, valueText } from './pieces.js';

const MOD_FLAG_TONE = {
  'batch-duplicate': 'warn',
  'duplicate-name': 'crit',
  'folder-collision': 'warn',
  'auto-named': 'warn',
  'no-metadata': 'muted',
  'no-source': 'muted',
  'orphan-copy': 'crit'
};

const PLUGIN_FLAG_TONE = {
  'duplicate-plugin': 'crit',
  'version-file': 'warn',
  'no-repository': 'muted',
  'no-source': 'muted'
};

const MAX_ROW_FLAGS = 3;

function flagBadges(entry, flagDefs, tones) {
  const active = flagDefs.filter((flag) => entry.flags?.has(flag.id));
  if (!active.length) return '';
  const shown = active.slice(0, MAX_ROW_FLAGS);
  const rest = active.length - shown.length;
  const badges = shown.map((flag) => `<span class="flag flag--${tones[flag.id] || 'muted'}" title="${esc(flag.label)} — ${esc(flag.hint)}">${icon(flag.icon)}</span>`);
  const more = rest > 0
    ? `<span class="flag flag--more" title="${esc(active.slice(MAX_ROW_FLAGS).map((flag) => flag.label).join(' · '))}">+${rest}</span>`
    : '';
  return `<span class="flags">${badges.join('')}${more}</span>`;
}

function sourceCell(source) {
  if (!source?.raw) return valueText(null, { muted: 'no source' });
  const label = source.kind === 'download' ? `mmdl ${source.id}` : source.kind === 'page' ? `mod ${source.id}` : source.host || 'link';
  return `<a class="value value--link" href="${esc(source.raw)}" target="_blank" rel="noreferrer noopener" title="${esc(source.raw)}">${esc(label)}${icon('open_in_new', 'value__external')}</a>`;
}

function headerCell(column, state, sortable = true) {
  const active = state.params.sort === column.key;
  const dir = state.params.dir === 'desc' ? 'desc' : 'asc';
  if (!sortable || column.key === 'source') return `<th scope="col" class="th th--${esc(column.key)}">${esc(column.label)}</th>`;
  return `<th scope="col" class="th th--${esc(column.key)}" aria-sort="${active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
    <button class="th__button${active ? ' is-active' : ''}" type="button" data-action="sort-column" data-value="${esc(column.key)}">
      ${esc(column.label)}
      ${active ? icon(dir === 'asc' ? 'arrow_upward' : 'arrow_downward', 'th__dir') : ''}
    </button>
  </th>`;
}

function modColumns() {
  return [
    { key: 'status', label: 'Status', cell: (mod) => statusChip(mod.status) },
    { key: 'name', label: 'Mod', cell: (mod) => `<span class="cell__title">${esc(mod.name)}</span>${flagBadges(mod, MOD_FLAGS, MOD_FLAG_TONE)}` },
    { key: 'category', label: 'Category', cell: (mod) => valueText(mod.category) },
    { key: 'version', label: 'Version', cell: (mod) => valueText(mod.version) },
    { key: 'author', label: 'Author', cell: (mod) => valueText(mod.authors) },
    { key: 'folder', label: 'Folder', cell: (mod) => `<span class="value value--mono value--truncate" title="${esc(mod.folderName)}">${esc(mod.folderName)}</span>` },
    { key: 'source', label: 'Source', cell: (mod) => sourceCell(mod.source) }
  ];
}

function pluginColumns() {
  return [
    { key: 'status', label: 'Status', cell: (plugin) => statusChip(plugin.status) },
    { key: 'name', label: 'Plugin', cell: (plugin) => `<span class="cell__title value--mono">${esc(plugin.name)}</span>${flagBadges(plugin, PLUGIN_FLAGS, PLUGIN_FLAG_TONE)}` },
    { key: 'version', label: 'Version', cell: (plugin) => valueText(plugin.version) },
    { key: 'size', label: 'Size', cell: (plugin) => valueText(plugin.size) },
    { key: 'repository', label: 'Repository', cell: (plugin) => valueText(plugin.repository, { mono: true }) },
    { key: 'source', label: 'Source', cell: (plugin) => sourceCell(plugin.source) }
  ];
}

function categorySelect(model, value) {
  const entries = [...model.index.categories.entries()].sort((a, b) => b[1] - a[1]);
  const options = [`<md-select-option value="" ${!value ? 'selected' : ''}><div slot="headline">All categories</div></md-select-option>`];
  for (const [name, count] of entries) {
    options.push(`<md-select-option value="${esc(name)}" ${value === name ? 'selected' : ''}>
      <div slot="headline">${esc(name)} (${formatNumber(count)})</div>
    </md-select-option>`);
  }
  return `<md-outlined-select class="control control--category" data-control="category" label="Category">${options.join('')}</md-outlined-select>`;
}

export function renderOtherFiles(state, kind) {
  const all = state.model.libraries.otherFiles.items.filter((entry) => entry.library === kind);
  if (!all.length) return '';
  const query = (state.params.q || '').trim().toLowerCase();
  const status = state.params.status || 'all';
  const items = all.filter((entry) =>
    (!query || [entry.name, entry.relativePath, entry.status, entry.sizeBytes].some((value) => String(value ?? '').toLowerCase().includes(query))) &&
    (status === 'all' || (status === 'other' ? !['active', 'disabled'].includes(entry.status) : entry.status === status))
  );
  const sort = state.params.sort;
  const dir = state.params.dir === 'desc' ? -1 : 1;
  items.sort((a, b) => {
    const key = sort === 'folder' ? 'relativePath' : ['name', 'status'].includes(sort) ? sort : 'index';
    return key === 'index' ? (a.index - b.index) * dir : String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * dir;
  });
  return `<section class="panel">
    <h2 class="block__title">Other files (${formatNumber(items.length)} / ${formatNumber(all.length)})</h2>
    ${items.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th scope="col">Status</th><th scope="col">File</th><th scope="col">Relative path</th><th scope="col">Size</th><th scope="col"><span class="sr-only">Open details</span></th></tr></thead>
      <tbody>${items.map((entry) => `<tr class="row" data-action="inspect" data-kind="other-file" data-id="${esc(entry.id)}" tabindex="0">
        <td class="td" data-label="Status">${statusChip(entry.status)}</td>
        <td class="td" data-label="File"><span class="cell__title value--mono">${esc(entry.name)}</span></td>
        <td class="td" data-label="Relative path">${valueText(entry.relativePath, { mono: true })}</td>
        <td class="td" data-label="Size">${valueText(formatBytes(entry.sizeBytes))}</td>
        <td class="td td--go"><span class="row__go">${icon('chevron_right')}</span></td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="prose">No other file matches the search and status filters.</p>'}
  </section>`;
}

export function renderLibrary(state, kind) {
  const isPlugins = kind === 'plugins';
  const library = isPlugins ? state.model.libraries.plugins : state.model.libraries.mods;
  const { items, total, finding, hasFocus } = filterEntries(state, isPlugins ? 'plugin' : 'mod');
  const flagDefs = isPlugins ? PLUGIN_FLAGS : MOD_FLAGS;
  const selectedFlags = parseList(state.params.flags);
  const showAllFlags = state.params.more === '1';
  const visibleFlags = showAllFlags ? flagDefs : flagDefs.slice(0, 5);
  const columns = isPlugins ? pluginColumns() : modColumns();
  const filterCount = selectedFlags.length + (state.params.q ? 1 : 0) + (state.params.status && state.params.status !== 'all' ? 1 : 0) + (state.params.category ? 1 : 0);
  const flagCounts = Object.fromEntries(flagDefs.map((flag) => [flag.id, library.items.filter((entry) => entry.flags?.has(flag.id)).length]));

  const rows = items.map((entry) => `<tr class="row" data-action="inspect" data-kind="${isPlugins ? 'plugin' : 'mod'}" data-id="${esc(entry.id)}" tabindex="0">
      ${columns.map((column) => `<td class="td td--${esc(column.key)}" data-label="${esc(column.label)}">${column.cell(entry)}</td>`).join('')}
      <td class="td td--go" data-label=""><span class="row__go">${icon('chevron_right')}</span></td>
    </tr>`).join('');

  const body = items.length
    ? `<div class="table-wrap">
        <table class="table">
          <thead><tr>${columns.map((column) => headerCell(column, state)).join('')}<th scope="col" class="th th--go"><span class="sr-only">Open details</span></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
    : emptyState({
      iconName: hasFocus ? 'filter_alt' : 'search_off',
      title: hasFocus ? 'No entry attached to this check' : 'Nothing matches these filters',
      body: hasFocus
        ? 'The check that sent you here listed no entry of this kind.'
        : `This dump lists ${formatNumber(total)} ${plural(total, isPlugins ? 'plugin' : 'mod')}. Loosen or clear the filters to see them.`,
      actions: ['<md-filled-button data-action="clear-filters">Clear filters</md-filled-button>']
    });

  return `<div class="view view--library">
    <header class="view__head">
      <div>
        <h1 class="view__title">${isPlugins ? 'Plugins' : 'Mods'}</h1>
        <p class="view__sub">${formatNumber(library.items.length)} ${plural(library.items.length, isPlugins ? 'plugin file' : 'folder')} in the dump${library.scanError ? ' · the scan reported an error' : ''}. Select a row for its full record and entries linked by the same diagnostic signals.</p>
      </div>
      <div class="view__actions">
        ${clearFiltersButton(filterCount)}
        ${!isPlugins ? `<md-text-button data-action="navigate" data-view="findings" data-params="${esc(JSON.stringify({ family: 'duplicates' }))}">${icon('copy_all')}Duplicate checks</md-text-button>` : ''}
      </div>
    </header>
    ${focusBanner(finding, isPlugins ? 'plugin' : 'mod', isPlugins ? 'plugins' : 'mods')}
    ${toolbar({
      leading: searchField({ value: state.params.q || '', label: 'Search', placeholder: isPlugins ? 'plugin, version, repository…' : 'name, folder, author, source…' }),
      trailing: `${!isPlugins ? categorySelect(state.model, state.params.category || '') : ''}${sortSelect({ value: state.params.sort || 'index' })}`,
      rows: [
        `<div class="chip-row chip-row--labelled"><span class="chip-row__label">Status</span>${statusChips({ value: state.params.status || 'all', counts: library.counts })}</div>`,
        `<div class="chip-row chip-row--labelled"><span class="chip-row__label">Signals</span>${flagChips({ flags: visibleFlags, selected: selectedFlags, counts: flagCounts })}
          <md-text-button class="chip-row__more" data-action="toggle-more" data-value="${showAllFlags ? '0' : '1'}">${icon(showAllFlags ? 'expand_less' : 'expand_more')}${showAllFlags ? 'Fewer signals' : `${flagDefs.length - visibleFlags.length} more`}</md-text-button>
        </div>`
      ]
    })}
    ${resultCount(items.length, library.items.length, isPlugins ? 'plugins' : 'mods')}
    <div class="results">${body}</div>
    ${renderOtherFiles(state, kind)}
  </div>`;
}
