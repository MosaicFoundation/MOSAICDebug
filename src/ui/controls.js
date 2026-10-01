import { esc, icon } from './pieces.js';
import { SORTS } from '../filters.js';
import { formatNumber } from '../model.js';

export function searchField({ value = '', placeholder = '', control = 'q', label = 'Search', minWidth = false }) {
  return `<md-outlined-text-field class="control control--search${minWidth ? ' control--narrow' : ''}" data-control="${esc(control)}" type="text"
    label="${esc(label)}" value="${esc(value)}" placeholder="${esc(placeholder)}" spellcheck="false" autocomplete="off">
    <md-icon slot="leading-icon">search</md-icon>
  </md-outlined-text-field>`;
}

export function sortSelect({ value = 'index', control = 'sort' }) {
  const options = SORTS.map((option) => `<md-select-option value="${esc(option.id)}" ${option.id === value ? 'selected' : ''}>
    <div slot="headline">${esc(option.label)}</div>
  </md-select-option>`).join('');
  return `<md-outlined-select class="control control--sort" data-control="${esc(control)}" label="Sort by">${options}</md-outlined-select>`;
}

const withCount = (label, count) => (typeof count === 'number' ? `${label} (${formatNumber(count)})` : label);

export function flagChips({ flags, selected, counts = {} }) {
  return flags.map((flag) => {
    const isSelected = selected.includes(flag.id);
    return `<md-filter-chip label="${esc(withCount(flag.label, counts[flag.id]))}" ${isSelected ? 'selected' : ''} title="${esc(flag.hint)}"
      data-action="toggle-flag" data-value="${esc(flag.id)}">
      <md-icon slot="icon">${esc(flag.icon)}</md-icon>
    </md-filter-chip>`;
  }).join('');
}

export function statusChips({ value = 'all', counts }) {
  const options = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'disabled', label: 'Disabled', count: counts.disabled },
    { id: 'other', label: 'Unknown status', count: counts.other }
  ].filter((option) => option.count === undefined || option.count > 0 || option.id === value);
  return options.map((option) => `<md-filter-chip label="${esc(withCount(option.label, option.count))}" ${option.id === value ? 'selected' : ''}
    data-action="set-status" data-value="${esc(option.id)}"></md-filter-chip>`).join('');
}

export function severityChips({ selected, counts }) {
  const options = [
    { id: 'critical', label: 'High-impact signal', tone: 'critical', iconName: 'error' },
    { id: 'warning', label: 'Potential signal', tone: 'warning', iconName: 'warning' },
    { id: 'info', label: 'Context', tone: 'info', iconName: 'info' },
    { id: 'ok', label: 'No match', tone: 'ok', iconName: 'check_circle' }
  ];
  return options.filter((option) => counts[option.id] > 0 || selected.includes(option.id)).map((option) => `<md-filter-chip
    label="${esc(withCount(option.label, counts[option.id] || 0))}" ${selected.includes(option.id) ? 'selected' : ''} data-action="toggle-sev" data-value="${esc(option.id)}">
    <md-icon slot="icon">${esc(option.iconName)}</md-icon>
  </md-filter-chip>`).join('');
}

export function familyChips({ families, selected, counts }) {
  return families.filter((family) => counts.get(family.id) || selected.includes(family.id)).map((family) => `<md-filter-chip
    label="${esc(withCount(family.label, counts.get(family.id) || 0))}" ${selected.includes(family.id) ? 'selected' : ''} data-action="toggle-family" data-value="${esc(family.id)}">
    <md-icon slot="icon">${esc(family.icon)}</md-icon>
  </md-filter-chip>`).join('');
}

export function toolbar({ leading = '', rows = [], trailing = '' }) {
  return `<div class="toolbar">
    <div class="toolbar__top">
      <div class="toolbar__leading">${leading}</div>
      ${trailing ? `<div class="toolbar__trailing">${trailing}</div>` : ''}
    </div>
    ${rows.filter(Boolean).map((row) => `<div class="toolbar__row">${row}</div>`).join('')}
  </div>`;
}

export function clearFiltersButton(count) {
  if (!count) return '';
  return `<md-text-button data-action="clear-filters">${icon('filter_alt_off')}Clear ${formatNumber(count)} filter${count === 1 ? '' : 's'}</md-text-button>`;
}

export function focusBanner(finding, kind, label) {
  if (!finding) return '';
  return `<div class="focus-banner">
    ${icon('filter_alt')}
    <span class="focus-banner__text">Showing only the ${esc(label)} attached to <strong>${esc(finding.title)}</strong></span>
    <button class="text-link" type="button" data-action="clear-focus">${icon('close')}Clear focus</button>
  </div>`;
}

export function resultCount(shown, total, noun) {
  return `<p class="result-count">${formatNumber(shown)} of ${formatNumber(total)} ${esc(noun)}</p>`;
}
