// HTML-Bausteine für Rezepte: Karten, Detailansicht, Editor.
// Reine Funktionen: bekommen alle Daten als Parameter, halten keinen eigenen Zustand.

import { escapeHtml as esc } from './util.js';
import { TAGS } from './constants.js';
import { formatQuantity, formatBase, parseAmount, canonicalUnit, unitInfo, RECIPE_UNIT_OPTIONS } from './units.js';
import { summaryText, shortText } from './matching.js';

export function categoryEmoji(cat){
  return cat === 'süß' ? '🍰' : cat === 'deftig' ? '🍲' : '🍽️';
}

function badgeClass(ev){
  if(ev.total === 0) return 'partial';
  if(ev.ok) return 'full';
  if(ev.missing.length === 0) return 'partial';
  return ev.missing.length >= ev.total / 2 ? 'none' : 'partial';
}

function statusBadge(r){
  if(r.status === 'pruefen') return '<span class="mini-badge warn">prüfen</span>';
  if(r.status === 'unvollstaendig') return '<span class="mini-badge warn">unvollständig</span>';
  return '';
}

function thumbHtml(r, img){
  return img
    ? `<img src="${esc(img)}" alt="" loading="lazy">`
    : `<span class="ph">${categoryEmoji(r.category)}</span>`;
}

// Karte in der Rezeptliste (Bild, Titel, Verfügbarkeit).
export function recipeCardHtml(r, ev, img){
  return `
    <a class="rcard" href="#/rezept/${encodeURIComponent(r.id)}">
      <div class="rthumb" data-img-for="${esc(r.id)}">${thumbHtml(r, img)}${r.category ? `<span class="cat-pill">${esc(r.category)}</span>` : ''}</div>
      <div class="rbody">
        <h3>${esc(r.name)}</h3>
        <div class="rmeta">
          <span class="avail-badge ${badgeClass(ev)}">${esc(summaryText(ev))}</span>
          ${r.zeit ? `<span class="rtime">${esc(r.zeit)}</span>` : ''}
          ${statusBadge(r)}
        </div>
      </div>
    </a>`;
}

function amountText(ing, factor){
  const n = parseAmount(ing.amount);
  const base = n === null ? String(ing.amount ?? '').trim() : formatQuantity(n * factor, ing.unit);
  if(!base) return '';
  return (ing.approx && n !== null ? 'ca. ' : '') + base;
}

function ingredientRowHtml(row, idx, factor, aliasFor, inventoryNames){
  const ing = row.ing;
  let info = '';
  if(row.status === 'knapp') info = `<span class="ing-info short">noch ${esc(shortText(row))}</span>`;
  else if(row.status === 'fehlt') info = `<button class="link-btn" data-action="alias-open" data-idx="${idx}">Hab ich anders</button>`;
  else if(row.status === 'grundvorrat') info = '<span class="ing-info">Grundvorrat</span>';
  else if(row.substitute && row.items.length) info = `<span class="ing-info">Ersatz: ${esc(row.items[0].name)}</span>`;

  const picker = aliasFor === idx ? `
    <div class="alias-pick">
      <select data-action="alias-pick" data-idx="${idx}">
        <option value="">Welcher Vorratsartikel ist das?</option>
        ${inventoryNames.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
      </select>
      <span class="hint">Die App merkt sich die Zuordnung.</span>
    </div>` : '';

  const amt = amountText(ing, factor);
  return `
    <li class="ing st-${row.status}">
      <span class="dot"></span>
      <span class="ing-main">
        <span class="amt">${esc(amt)}</span>
        <span class="nm">${esc(ing.name)}${ing.note ? ` <span class="note">${esc(ing.note)}</span>` : ''}</span>
      </span>
      ${info}
      ${picker}
    </li>`;
}

// Detailansicht eines Rezepts.
export function recipeDetailHtml(o){
  const { r, ev, portions, img, aliasFor, inventoryNames, cookInfo, steps: stepList } = o;
  const base = r.servings || 2;
  const factor = portions / base;
  const notice = r.status === 'unvollstaendig'
    ? '<div class="notice">Das Rezept war nicht vollständig im Instagram-Text. Bitte über „Bearbeiten“ ergänzen oder im Original nachsehen.</div>'
    : r.status === 'pruefen'
      ? '<div class="notice">Bitte kurz prüfen: Mengen oder Schritte waren im Original unklar oder wurden umgerechnet.</div>'
      : '';
  const facts = [
    r.category ? `<span class="badge">${esc(r.category)}</span>` : '',
    r.zeit ? `<span>⏱ ${esc(r.zeit)}</span>` : '',
    r.source === 'instagram' && r.author ? `<span>@${esc(r.author)}</span>` : '',
    cookInfo ? `<span>zuletzt gekocht: ${esc(cookInfo.last)}${cookInfo.count > 1 ? ' (' + cookInfo.count + '×)' : ''}</span>` : ''
  ].filter(Boolean).join('');
  const tags = (r.tags || []).map(t => `<span class="recipe-tag">${esc(t)}</span>`).join('');
  const hasStepsField = Array.isArray(r.steps) && r.steps.length > 0;
  const steps = (stepList && stepList.length)
    ? `<ol class="detail-steps">${stepList.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`
    : '<div class="empty-note">Noch keine Zubereitung hinterlegt.</div>';
  const ings = ev.rows.length
    ? `<ul class="detail-ings">${ev.rows.map((row, i) => ingredientRowHtml(row, i, factor, aliasFor, inventoryNames)).join('')}</ul>`
    : '<div class="empty-note">Noch keine Zutaten hinterlegt.</div>';
  const needShop = ev.missing.length + ev.short.length;

  return `
    <div class="detail">
      <div class="detail-bar">
        <button class="btn small secondary" data-action="go-back">← Zurück</button>
        <button class="btn small secondary" data-action="edit-recipe" data-id="${esc(r.id)}">✎ Bearbeiten</button>
      </div>
      <div class="hero" data-img-for="${esc(r.id)}">${thumbHtml(r, img)}</div>
      <h1 class="detail-title">${esc(r.name)}</h1>
      <div class="facts">${facts}</div>
      ${tags ? `<div class="recipe-tags">${tags}</div>` : ''}
      ${notice}
      <div class="detail-actions">
        <button class="btn" data-action="cook-recipe" data-id="${esc(r.id)}">👨‍🍳 Kochen</button>
        <button class="btn secondary" data-action="cook-done-open" data-id="${esc(r.id)}">✔ Gekocht</button>
        <button class="btn secondary" data-action="plan-recipe" data-id="${esc(r.id)}">Wochenplan</button>
        ${r.sourceUrl ? `<a class="btn secondary" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">Original</a>` : ''}
      </div>
      <section class="card">
        <div class="portions-row">
          <h2>Zutaten</h2>
          <span class="portions">
            <button class="step-btn" data-action="portions-dec" aria-label="Weniger Portionen">−</button>
            <span class="portions-n">${portions} ${portions === 1 ? 'Portion' : 'Portionen'}</span>
            <button class="step-btn" data-action="portions-inc" aria-label="Mehr Portionen">+</button>
          </span>
        </div>
        <div class="avail-line"><span class="avail-badge ${badgeClass(ev)}">${esc(summaryText(ev))}</span></div>
        ${ings}
        ${needShop ? `<div class="detail-actions"><button class="btn small" data-action="recipe-to-shopping" data-id="${esc(r.id)}">${needShop} fehlende Zutat${needShop === 1 ? '' : 'en'} auf die Einkaufsliste</button></div>` : ''}
      </section>
      <section class="card">
        <h2>Zubereitung</h2>
        ${steps}
        ${r.notes && hasStepsField ? `<div class="recipe-notes">${esc(r.notes)}</div>` : ''}
        ${r.nutrition ? `<div class="recipe-notes">${esc(r.nutrition)}</div>` : ''}
      </section>
      <div class="detail-foot">
        <button class="btn small secondary danger-text" data-action="del-recipe" data-id="${esc(r.id)}">Rezept löschen</button>
      </div>
    </div>`;
}

function unitOptionsFor(current){
  const cur = String(current ?? '').trim();
  const canon = canonicalUnit(cur);
  const sel = unitInfo(cur) ? canon : cur;
  const opts = ['', ...RECIPE_UNIT_OPTIONS];
  if(sel && !opts.includes(sel)) opts.push(sel);
  return opts.map(u => `<option value="${esc(u)}" ${u === sel ? 'selected' : ''}>${u ? esc(u) : '(ohne)'}</option>`).join('');
}

// Editor für neue und bestehende Rezepte.
export function editorHtml(edit, categories){
  const imgPreview = edit.newImage || (edit.removeImage ? null : edit.img);
  const catOpts = ['', ...categories].map(c => `<option value="${esc(c)}" ${c === (edit.category || '') ? 'selected' : ''}>${c ? esc(c) : '(keine)'}</option>`).join('')
    + '<option value="__new">+ Neue Kategorie …</option>';
  const tagChips = TAGS.map(t => `<span class="tag-chip ${edit.tags.includes(t) ? 'selected' : ''}" data-action="edit-toggle-tag" data-tag="${esc(t)}">${esc(t)}</span>`).join('');
  const ingRows = edit.ingredients.map((ing, i) => `
    <div class="ing-row">
      <div class="row">
        <input type="text" class="amt" inputmode="decimal" placeholder="Menge" value="${esc(ing.amount ?? '')}" data-ing="${i}" data-k="amount">
        <select class="unit" data-ing="${i}" data-k="unit">${unitOptionsFor(ing.unit)}</select>
        <input type="text" placeholder="Zutat" value="${esc(ing.name ?? '')}" data-ing="${i}" data-k="name">
      </div>
      <div class="row">
        <input type="text" placeholder="Notiz (z. B. fein gewürfelt)" value="${esc(ing.note ?? '')}" data-ing="${i}" data-k="note">
        <label class="check"><input type="checkbox" ${ing.approx ? 'checked' : ''} data-action="edit-ing-approx" data-ing="${i}"> ca.</label>
        <button class="btn small secondary" data-action="edit-ing-del" data-ing="${i}" aria-label="Zutat entfernen">×</button>
      </div>
    </div>`).join('');
  const stepRows = edit.steps.map((s, i) => `
    <div class="step-row">
      <textarea rows="2" placeholder="Schritt ${i + 1}" data-step="${i}">${esc(s)}</textarea>
      <div class="tools">
        <button class="btn small secondary" data-action="edit-step-up" data-step="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn small secondary" data-action="edit-step-down" data-step="${i}" ${i === edit.steps.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn small secondary" data-action="edit-step-del" data-step="${i}">Entfernen</button>
      </div>
    </div>`).join('');

  return `
    <div class="editor">
      <div class="detail-bar">
        <button class="btn small secondary" data-action="edit-cancel">← Abbrechen</button>
        <button class="btn small" data-action="edit-save">Speichern</button>
      </div>
      <h1 class="detail-title">${edit.isNew ? 'Neues Rezept' : 'Rezept bearbeiten'}</h1>
      <div class="card form">
        <label class="lbl">Name</label>
        <input type="text" value="${esc(edit.name)}" data-f="name" placeholder="Name des Gerichts">
        <div class="row two">
          <div><label class="lbl">Kategorie</label><select data-action="edit-category">${catOpts}</select></div>
          <div><label class="lbl">Portionen</label><input type="text" inputmode="numeric" value="${esc(edit.servings ?? '')}" data-f="servings" placeholder="z. B. 4"></div>
        </div>
        <label class="lbl">Zeit</label>
        <input type="text" value="${esc(edit.zeit ?? '')}" data-f="zeit" placeholder="z. B. 25 Min.">
        <label class="lbl">Tags</label>
        <div>${tagChips}</div>
        <label class="lbl">Quelle (Link, optional)</label>
        <input type="text" value="${esc(edit.sourceUrl ?? '')}" data-f="sourceUrl" placeholder="https://…">
        <label class="lbl">Titelbild</label>
        <div class="img-edit">
          <div class="mini">${imgPreview ? `<img src="${esc(imgPreview)}" alt="">` : categoryEmoji(edit.category)}</div>
          <div class="btns">
            <button class="btn small secondary" data-action="edit-img-pick">${imgPreview ? 'Bild ändern' : 'Bild wählen'}</button>
            ${imgPreview ? '<button class="btn small secondary" data-action="edit-img-clear">Entfernen</button>' : ''}
          </div>
          <input type="file" id="edit-img-file" accept="image/*" style="display:none;">
        </div>
      </div>
      <div class="card form">
        <h2>Zutaten</h2>
        ${ingRows || '<div class="empty-note">Noch keine Zutaten.</div>'}
        <div class="row"><button class="btn small secondary" data-action="edit-ing-add">+ Zutat</button></div>
        <label class="lbl">Zutatenliste einfügen (eine Zutat pro Zeile, z. B. „200 g Mehl“)</label>
        <textarea rows="3" id="edit-paste" placeholder="200 g Mehl&#10;2 Eier&#10;1 TL Backpulver"></textarea>
        <div class="row"><button class="btn small secondary" data-action="edit-ing-paste">Zeilen übernehmen</button></div>
      </div>
      <div class="card form">
        <h2>Zubereitung</h2>
        ${stepRows || '<div class="empty-note">Noch keine Schritte.</div>'}
        <div class="row"><button class="btn small secondary" data-action="edit-step-add">+ Schritt</button></div>
      </div>
      <div class="sticky-actions">
        <button class="btn secondary" data-action="edit-cancel">Abbrechen</button>
        <button class="btn" data-action="edit-save">Speichern</button>
      </div>
    </div>`;
}

function pickText(p){
  const after = p.after === 0 ? 'leer' : formatQuantity(p.after, p.before.unit);
  const where = p.location ? ` (${esc(p.location)})` : '';
  return `${esc(formatBase(p.dim, p.take))} von ${esc(p.name)}${where}: ${esc(formatQuantity(p.before.amount, p.before.unit))} → ${esc(after)}`;
}

function dedRowHtml(row, on, aliasFor, inventoryNames){
  const name = esc(row.ing.name);
  if(row.kind === 'staple') return '';
  if(row.kind === 'missing'){
    const picker = aliasFor === row.idx ? `
      <div class="alias-pick">
        <select data-action="alias-pick" data-idx="${row.idx}">
          <option value="">Welcher Vorratsartikel ist das?</option>
          ${inventoryNames.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
        </select>
      </div>` : '';
    return `<li class="ded off"><div><span class="ded-name">${name}</span> <span class="ded-note">nicht im Vorrat – nichts abzubuchen</span>
      <button class="link-btn" data-action="alias-open" data-idx="${row.idx}">Hab ich anders</button></div>${picker}</li>`;
  }
  if(row.kind === 'unknown') return `<li class="ded off"><span class="ded-name">${name}</span> <span class="ded-note">keine Menge im Rezept</span></li>`;
  if(row.kind === 'unconvertible'){
    return `<li class="ded off"><span class="ded-name">${name}</span> <span class="ded-note">Menge nicht umrechenbar (Packungsgröße am Vorratsartikel eintragen)</span></li>`;
  }
  const flags = [
    row.short > 0 ? `<span class="ing-info short">es fehlen ${esc(formatBase(row.need.dim, row.short))}</span>` : '',
    row.loose ? '<span class="ing-info">kleine Menge</span>' : '',
    row.substitute ? '<span class="ing-info">Ersatz</span>' : ''
  ].filter(Boolean).join(' ');
  return `
    <li class="ded">
      <label>
        <input type="checkbox" data-action="ded-toggle" data-idx="${row.idx}" ${on ? 'checked' : ''}>
        <span class="ded-body">
          <span class="ded-name">${name}</span> ${flags}
          <span class="ded-detail">${row.picks.map(pickText).join('<br>')}</span>
        </span>
      </label>
    </li>`;
}

// Abbuchen-Seite: zeigt je Zutat, was aus welchem Vorratsartikel abgezogen wird.
export function cookSheetHtml(o){
  const { r, portions, rows, on, aliasFor, inventoryNames } = o;
  const list = rows.map(row => dedRowHtml(row, on(row), aliasFor, inventoryNames)).join('');
  const count = rows.filter(row => row.kind === 'deduct' && on(row)).length;
  const staples = rows.some(row => row.kind === 'staple');
  return `
    <div class="sheet-page">
      <div class="detail-bar">
        <button class="btn small secondary" data-action="go-back">← Zurück</button>
      </div>
      <h1 class="detail-title">Gekocht: ${esc(r.name)}</h1>
      <div class="status-line-dark">Die Haken bestimmen, was aus dem Vorrat abgezogen wird. Kleine Mengen und Gewürze sind vorerst abgewählt.</div>
      <div class="portions-row on-dark">
        <span>Portionen</span>
        <span class="portions">
          <button class="step-btn" data-action="sheet-portions-dec" aria-label="Weniger Portionen">−</button>
          <span class="portions-n">${portions}</span>
          <button class="step-btn" data-action="sheet-portions-inc" aria-label="Mehr Portionen">+</button>
        </span>
      </div>
      <div class="card">
        <ul class="ded-list">${list || '<li class="empty-note">Keine Zutaten.</li>'}</ul>
        ${staples ? '<div class="hint">Grundvorrat (z. B. Salz) wird nicht abgebucht.</div>' : ''}
      </div>
      <div class="sticky-actions">
        <button class="btn secondary" data-action="go-back">Abbrechen</button>
        <button class="btn" data-action="sheet-confirm">${count ? count + ' Zutat' + (count === 1 ? '' : 'en') + ' abbuchen' : 'Nur als gekocht merken'}</button>
      </div>
    </div>`;
}
