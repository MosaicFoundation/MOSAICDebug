import { formatNumber, plural, SEVERITY_LABEL } from '../model.js';
import { FAMILIES, FAMILY_ICON, FAMILY_LABEL, familyCounts } from '../analysis.js';
import { filterFindings, parseList } from '../filters.js';
import { clearFiltersButton, focusBanner, resultCount, searchField, severityChips, familyChips, sortSelect, toolbar } from './controls.js';
import { emptyState, esc, icon, severityTag } from './pieces.js';


function subjectRow(subject) {
  const kindLabel = subject.type === 'plugin' ? 'plugin' : 'mod';
  return `<li class="subject">
    <button class="subject__button" type="button" data-action="inspect" data-kind="${kindLabel}" data-id="${esc(subject.id)}">
      <span class="subject__label">${esc(subject.label)}</span>
      ${subject.detail && subject.detail !== subject.label ? `<span class="subject__detail">${esc(subject.detail)}</span>` : ''}
      ${subject.status ? `<span class="chip chip--${subject.status === 'active' ? 'ok' : subject.status === 'disabled' ? 'muted' : 'critical'}">${esc(subject.status)}</span>` : ''}
      ${icon('chevron_right', 'subject__chev')}
    </button>
  </li>`;
}

function subjectList(subjects, limit, findingId, kind) {
  const shown = subjects.slice(0, limit);
  const rest = subjects.length - shown.length;
  const focusKind = kind || (subjects[0]?.type === 'plugin' ? 'plugins' : 'mods');
  return `<ul class="subjects">${shown.map(subjectRow).join('')}</ul>
    ${rest > 0 ? `<button class="text-link" type="button" data-action="navigate" data-view="${focusKind}" data-params="${esc(JSON.stringify({ focus: findingId }))}">
      ${icon('unfold_more')}Show all ${formatNumber(subjects.length)} in the ${focusKind === 'mods' ? 'mod list' : 'plugin list'}
    </button>` : ''}`;
}

function evidenceList(evidence) {
  if (!evidence?.length) return '';
  return `<div class="evidence">
    <h4 class="block__title">Supporting evidence</h4>
    <ul class="evidence__list">
      ${evidence.map((row) => `<li class="evidence__row">
        <span class="evidence__label">${esc(row.label)}</span>
        <span class="evidence__value${row.mono ? ' value--mono' : ''}">${esc(row.value)}</span>
      </li>`).join('')}
    </ul>
  </div>`;
}

function groupList(groups, findingId) {
  if (!groups?.length) return '';
  return `<div class="groups">
    ${groups.map((group) => `<div class="group">
      <div class="group__head">
        <span class="group__label">${esc(group.label)}</span>
        ${group.meta ? `<span class="chip chip--muted">${esc(group.meta)}</span>` : ''}
      </div>
      ${group.note ? `<p class="group__note">${esc(group.note)}</p>` : ''}
      ${subjectList(group.items, 8, findingId)}
    </div>`).join('')}
  </div>`;
}

function findingCard(finding, state) {
  const open = state.params.expand === '1' || state.params.open === finding.id;
  const kinds = new Set(finding.subjects.map((subject) => subject.type));
  const focusView = kinds.has('plugin') && !kinds.has('mod') ? 'plugins' : 'mods';
  const focusLabel = focusView === 'plugins' ? 'plugin list' : 'mod list';
  const canFocus = finding.subjects.length > 0;

  return `<details class="finding finding--${esc(finding.severity)}" id="finding-${esc(finding.id)}" ${open ? 'open' : ''}>
    <summary class="finding__summary">
      <span class="finding__lead">${severityTag(finding.severity)}</span>
      <span class="finding__title">${esc(finding.title)}</span>
      <span class="finding__family">${esc(FAMILY_LABEL[finding.family] || finding.family)}</span>
      <span class="finding__instances">${formatNumber(finding.count)} ${plural(finding.count, 'instance')}</span>
      ${icon('expand_more', 'finding__chev')}
    </summary>
    <div class="finding__body">
      <div class="finding__main">
        ${finding.summary ? `<p class="finding__summary-text">${esc(finding.summary)}</p>` : ''}
        <div class="finding__prose">
          ${finding.why ? `<div class="prose-block"><h4 class="block__title">Why this matched</h4><p>${esc(finding.why)}</p></div>` : ''}
          ${finding.impact ? `<div class="prose-block"><h4 class="block__title">Possible relevance</h4><p>${esc(finding.impact)}</p></div>` : ''}
          ${finding.investigation ? `<div class="prose-block"><h4 class="block__title">For the investigation</h4><p>${esc(finding.investigation)}</p></div>` : ''}
        </div>
        ${evidenceList(finding.evidence)}
        ${groupList(finding.groups, finding.id)}
        ${!finding.groups?.length && finding.subjects.length ? `<div class="finding__subjects">
          <h4 class="block__title">Related entries</h4>
          ${subjectList(finding.subjects, 12, finding.id)}
        </div>` : ''}
      </div>
      <aside class="finding__aside">
        <div class="aside-facts">
          <span class="aside-fact"><span class="aside-fact__key">Signal priority</span><span class="aside-fact__value">${esc(SEVERITY_LABEL[finding.severity])}</span></span>
          <span class="aside-fact"><span class="aside-fact__key">Family</span><span class="aside-fact__value">${esc(FAMILY_LABEL[finding.family] || finding.family)}</span></span>
          <span class="aside-fact"><span class="aside-fact__key">Instances</span><span class="aside-fact__value">${formatNumber(finding.count)}</span></span>
          <span class="aside-fact"><span class="aside-fact__key">Check id</span><span class="aside-fact__value value--mono">${esc(finding.rule)}</span></span>
        </div>
        <div class="aside-actions">
          ${canFocus ? `<md-filled-tonal-button data-action="navigate" data-view="${focusView}" data-params="${esc(JSON.stringify({ focus: finding.id }))}">
            ${icon('filter_alt')}Inspect related ${focusLabel}
          </md-filled-tonal-button>` : ''}
          <md-text-button data-action="copy-finding" data-id="${esc(finding.id)}">${icon('content_copy')}Copy this signal</md-text-button>
          <md-text-button data-action="copy-link" data-id="${esc(finding.id)}">${icon('link')}Copy link</md-text-button>
        </div>
      </aside>
    </div>
  </details>`;
}

export function renderFindings(state) {
  const all = state.analysis.findings;
  const findings = filterFindings(state);
  const severities = parseList(state.params.sev);
  const families = parseList(state.params.family);
  const counts = familyCounts(all);
  const severityCounts = state.analysis.signals.counts;
  const filterCount = severities.length + families.length + (state.params.q ? 1 : 0);
  const expandAll = state.params.expand === '1';

  const body = findings.length
    ? `<div class="findings">${findings.map((finding) => findingCard(finding, state)).join('')}</div>`
    : all.length
      ? emptyState({
        iconName: 'filter_alt_off',
        title: 'No signal matches these filters',
        body: `${formatNumber(all.length)} triage checks ran on this dump. Loosen the filters to see their signals again.`,
        actions: ['<md-filled-button data-action="clear-filters">Clear filters</md-filled-button>']
      })
      : emptyState({
        iconName: 'verified',
        title: 'No diagnostic leads found',
        body: 'The current checks found no matching signals in this dump. That does not rule out the reported issue; compare against symptoms, logs or another dump.'
      });

  return `<div class="view view--findings">
    <header class="view__head">
      <div>
        <h1 class="view__title">Triage signals</h1>
        <p class="view__sub">${formatNumber(all.length)} automatic ${plural(all.length, 'check')} covering duplicates, source records, metadata, configuration, plugins and system. Treat matches as investigation leads: compare their evidence with the reported symptoms before drawing conclusions.</p>
      </div>
      <div class="view__actions">
        <md-text-button data-action="toggle-expand" data-value="${expandAll ? '0' : '1'}">${icon(expandAll ? 'unfold_less' : 'unfold_more')}${expandAll ? 'Collapse all' : 'Expand all'}</md-text-button>
        ${clearFiltersButton(filterCount)}
      </div>
    </header>
    ${toolbar({
      leading: searchField({ value: state.params.q || '', label: 'Search signals', placeholder: 'duplicate, source, version…' }),
      trailing: sortSelect({ value: state.params.sort === 'count' || state.params.sort === 'family' || state.params.sort === 'name' ? state.params.sort : 'severity' }),
      rows: [
        `<div class="chip-row chip-row--labelled"><span class="chip-row__label">Signal priority</span>${severityChips({ selected: severities, counts: severityCounts })}</div>`,
        `<div class="chip-row chip-row--labelled"><span class="chip-row__label">Family</span>${familyChips({ families: FAMILIES, selected: families, counts })}</div>`
      ]
    })}
    ${resultCount(findings.length, all.length, 'signals')}
    <div class="results">${body}</div>
  </div>`;
}
