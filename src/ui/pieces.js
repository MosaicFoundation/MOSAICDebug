import { CORE_PLUGINS, SEVERITY_LABEL } from '../model.js';

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

export const SEVERITY_ICON = { critical: 'error', warning: 'warning', info: 'info', ok: 'check_circle' };
export const SEVERITY_VAR = {
  critical: 'var(--mi-crit)',
  warning: 'var(--mi-warn)',
  info: 'var(--mi-info)',
  ok: 'var(--mi-ok)'
};

export const severityVar = (severity) => SEVERITY_VAR[severity] || SEVERITY_VAR.info;

export const icon = (name, className = '') => `<md-icon class="${className}">${esc(name)}</md-icon>`;

export function severityTag(severity, text = SEVERITY_LABEL[severity]) {
  return `<span class="tag tag--${esc(severity)}">${icon(SEVERITY_ICON[severity], 'tag__icon')}<span>${esc(text)}</span></span>`;
}

export function statusChip(status) {
  const known = status === 'active' || status === 'disabled';
  const tone = status === 'active' ? 'ok' : known ? 'muted' : 'critical';
  const label = status || 'no status';
  return `<span class="chip chip--${tone}" title="Status reported by the dump">${esc(label)}</span>`;
}

export function valueText(value, { mono = false, muted = '—' } = {}) {
  if (value === null || value === undefined || value === '') return `<span class="value value--empty">${esc(muted)}</span>`;
  return `<span class="value${mono ? ' value--mono' : ''}">${esc(value)}</span>`;
}

export function copyButton(value, label = 'Copy') {
  return `<button class="icon-action" type="button" data-action="copy" data-copy="${esc(value)}" title="${esc(label)}" aria-label="${esc(label)}">${icon('content_copy')}</button>`;
}

export function defList(rows) {
  const body = rows.filter(Boolean).map((row) => {
    const value = row.href
      ? `<a class="value value--link" href="${esc(row.href)}" target="_blank" rel="noreferrer noopener">${esc(row.value ?? row.href)}</a>`
      : valueText(row.value, { mono: row.mono });
    return `<div class="def">
      <dt class="def__key">${esc(row.label)}</dt>
      <dd class="def__value">
        <span class="def__content">${value}</span>
        ${row.copy && row.value ? copyButton(row.value, `Copy ${row.label}`) : ''}
        ${row.hint ? `<span class="def__hint">${esc(row.hint)}</span>` : ''}
      </dd>
    </div>`;
  }).join('');
  return `<dl class="def-list">${body}</dl>`;
}

export function panelOpen(title, subtitle, body, extraClass = '') {
  return `<section class="panel ${extraClass}">
    <header class="panel__head">
      <div>
        <h2 class="panel__title">${esc(title)}</h2>
        ${subtitle ? `<p class="panel__subtitle">${esc(subtitle)}</p>` : ''}
      </div>
    </header>
    <div class="panel__body">${body}</div>
  </section>`;
}

export function pluginChecklist(plugins) {
  return `<ul class="checklist">
    ${CORE_PLUGINS.map((entry) => {
      const found = plugins.filter((plugin) => plugin.slug === entry.key || plugin.slug.startsWith(entry.key));
      return `<li class="check checklist__row checklist__row--${found.length ? 'ok' : entry.need === 'required' ? 'crit' : 'muted'}">
        <span class="check__icon">${icon(found.length ? 'check_circle' : entry.need === 'required' ? 'error' : 'radio_button_unchecked')}</span>
        <span class="check__main">
          <span class="check__title">${esc(entry.label)} <span class="chip chip--${entry.need === 'required' ? 'crit' : entry.need === 'recommended' ? 'warn' : 'muted'}">${esc(entry.need)}</span></span>
          <span class="check__why">${esc(entry.why)}</span>
          ${found.length ? `<span class="check__found">${found.map((plugin) => `${esc(plugin.name)}${plugin.version ? ` · ${esc(plugin.version)}` : ''}`).join(' · ')}</span>` : ''}
        </span>
      </li>`;
    }).join('')}
  </ul>`;
}

export function emptyState({ iconName = 'inbox', title, body, actions = [] }) {
  return `<div class="empty">
    <div class="empty__art">${icon(iconName, 'empty__icon')}</div>
    <h2 class="empty__title">${esc(title)}</h2>
    <p class="empty__body">${body}</p>
    ${actions.length ? `<div class="empty__actions">${actions.join('')}</div>` : ''}
  </div>`;
}

