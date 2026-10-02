import { formatBytes, formatDateTime } from '../model.js';
import { defList, emptyState, esc, panelOpen } from './pieces.js';
import { searchField, toolbar } from './controls.js';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = (value) => Array.isArray(value) ? value : [];
const text = (value) => value == null ? null : typeof value === 'object' ? JSON.stringify(value) : String(value);
const yesNo = (value) => value === true ? 'Yes' : value === false ? 'No' : 'Not recorded';
const date = (value) => formatDateTime(Date.parse(value)) || text(value);
const rawLink = (path, label) => `<a href="#/raw?path=${encodeURIComponent(path)}">${esc(label)}</a>`;

function characters(layout, key, title, query) {
  const entries = list(layout[key]);
  const rows = entries.map((value, index) => ({ value, index })).filter(({ value }) =>
    !query || JSON.stringify(value).toLowerCase().includes(query));
  const body = rows.length ? `<div class="table-wrap"><table class="table css-editor__table">
    <thead><tr>${['Character', 'Order', 'Selectable', 'Slots', 'Fighter / series'].map(label => `<th scope="col" class="th"><span class="th__button">${label}</span></th>`).join('')}</tr></thead>
    <tbody>${rows.map(({ value, index }) => {
      const character = object(value) ? value : {};
      return `<tr class="row" tabindex="0" data-action="inspect-character" data-list="${key}" data-index="${index}" aria-label="${esc(`Inspect ${text(character.displayName) || text(character.id) || `Character ${index + 1}`}`)}">
        <td class="td" data-label="Character"><button type="button" class="css-editor__character" data-action="inspect-character" data-list="${key}" data-index="${index}" aria-haspopup="dialog">${esc(text(character.displayName) || text(character.id) || `Character ${index + 1}`)}</button><div class="value--mono">${esc(text(character.id))}</div></td>
        <td class="td" data-label="Order">${esc(text(character.order) ?? '—')}</td>
        <td class="td" data-label="Selectable">${yesNo(character.canSelect)}</td>
        <td class="td" data-label="Slots">${Array.isArray(character.slots) ? character.slots.length : '—'}</td>
        <td class="td value--mono" data-label="Fighter / series">${esc(text(character.fighterKind) || '—')}<div>${esc(text(character.uiSeriesId))}</div></td>
      </tr>`;
    }).join('')}</tbody></table></div>` : `<p class="prose">${query ? 'No matching characters.' : Array.isArray(layout[key]) ? 'No characters in this list.' : 'Character list not recorded.'}</p>`;
  return panelOpen(title, `${rows.length} of ${entries.length} characters · Open a character for all fields and costume slots`, body);
}

export function renderCssEditor({ model, params = {} }) {
  const css = model.raw?.cssEditor;
  const header = `<header class="view__head"><div><h1 class="view__title">CSS Editor</h1><p class="view__sub">Character selection screen: persisted files and layout recorded in this dump.</p></div></header>`;
  if (!object(css)) return `<div class="view">${header}${emptyState({ iconName: 'grid_view', title: 'CSS Editor data unavailable', body: css == null ? 'This dump does not include a CSS Editor section.' : 'The CSS Editor section is not a readable object.' })}</div>`;
  const layout = object(css.layout) ? css.layout : {};
  const files = list(css.files);
  const source = files.find(file => file?.name === 'character-css-source.json')?.data;
  const query = (params.q || '').trim().toLowerCase();
  const summary = defList([
    { label: 'Imported', value: yesNo(css.imported) },
    { label: 'Scope', value: text(css.scope) },
    { label: 'Layout source', value: text(layout.source) },
    { label: 'Imported at', value: date(source?.importedAt) },
    { label: 'Layout error', value: text(css.layoutError) || 'None recorded' }
  ]) + `<p class="prose">${rawLink('$.cssEditor', 'Inspect complete CSS Editor data')}</p>`;
  const sources = object(source?.sourceFiles) ? Object.entries(source.sourceFiles) : [];
  const fileCards = files.map((value, index) => {
    const file = object(value) ? value : {};
    return panelOpen(text(file.name) || `File ${index + 1}`, file.exists === true ? 'Present' : file.exists === false ? 'Missing' : 'Presence not recorded', defList([
      { label: 'Size', value: formatBytes(file.sizeBytes) },
      { label: 'Modified', value: date(file.modifiedAt) },
      { label: 'Content', value: file.data != null ? 'Parsed data included' : file.rawText != null ? 'Raw text included' : 'Metadata only' },
      { label: 'Error', value: text(file.error) || 'None recorded' }
    ]) + `<p class="prose">${rawLink(`$.cssEditor.files[${index}]`, 'Inspect file record')}</p>`);
  }).join('');
  return `<div class="view view--css-editor">${header}
    <div class="css-editor__grid">${panelOpen('Import & layout', null, summary)}${sources.length ? panelOpen('Source files', 'Paths recorded at import', defList(sources.map(([label, value]) => ({ label, value: text(value), mono: true, copy: true })))) : ''}</div>
    <section aria-label="Persisted files"><h2 class="block__title">Persisted files · ${files.length}</h2><div class="css-editor__grid">${fileCards || '<p class="prose">No file records available.</p>'}</div></section>
    ${toolbar({ leading: searchField({ value: params.q || '', label: 'Search characters', placeholder: 'Name, fighter, series or costume slot' }) })}
    ${css.layout == null ? '<p class="prose">Layout not available in this dump.</p>' : !object(css.layout) ? '<p class="prose">Layout is not a readable object.</p>' : characters(layout, 'visibleCharacters', 'Visible characters', query) + characters(layout, 'hiddenCharacters', 'Hidden characters', query) + panelOpen('Groups', null, `<p class="prose">${object(layout.groups) || Array.isArray(layout.groups) ? `${Object.keys(layout.groups).length} groups · ${rawLink('$.cssEditor.layout.groups', 'Inspect groups')}` : 'Groups not recorded.'}</p>`)}
  </div>`;
}
