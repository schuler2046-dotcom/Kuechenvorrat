// Küchenvorrat – gemeinsame Vorrats-, Rezept- und Wochenplan-App.
// UI-Logik, portiert vom Claude-Artifact (referenz/kuechenvorrat-artifact.html),
// Datenzugriff über store.js (Firestore-Echtzeit-Sync bzw. lokaler Fallback).

import { initStore, mutate, storeMode, DATA_KEYS } from './store.js';
import { LOCATIONS, CATEGORIES, TAGS, DAYS } from './constants.js';
import { uid, escapeHtml } from './util.js';
import { parseIngredientLine, normalizeIngredient } from './parse.js';
import { buildAiPrompt, buildPhotoPrompt, parseAiRecipes, parsePhotoItems } from './ai.js';
import { spokenToLines } from './voice.js';
import {
  parseAmount, canonicalUnit, isItemUnit, stepFor, formatQuantity, addAmounts,
  suggestPackSize, UNIT_OPTIONS
} from './units.js';

const HOUSEHOLD_LS_KEY = 'vorrat-household';

// ---------- Zustand ----------

let inventory = [];
let recipes = [];
let weekplan = {};
let shopping = [];
let meta = {};
let activeTab = 'vorrat';
let recipeFilterTags = [];
let ready = false;
let lastSync = null;
let statusMsg = '';
let online = navigator.onLine;
let pendingRender = false;
let collapsedCats = new Set();

let draftName = '', draftNotes = '';
let draftTags = [];
let draftIngredients = [];
let aiPasteOpen = false;
let aiSuggestions = null;
let aiError = '';
let photoPasteOpen = false;
let photoItems = null;
let photoError = '';
let bulkDraft = '';
let invSearch = '';
let editingItemId = null;
let cookingRecipeId = null;
let cookChecked = new Set(), cookStepsDone = new Set();
let wakeLock = null;
let photoFile = null, photoPreviewUrl = '';
let voiceListening = false, voiceError = '';
let voiceStopRequested = false, voiceRestartTimer = null;
let recognition = null;
let householdCode = localStorage.getItem(HOUSEHOLD_LS_KEY) || '';
const receivedKeys = new Set();

// Feature-Erkennung: Spracherkennung (Web Speech API) und Datei-Teilen (Web Share API).
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceSupported = !!SpeechRec;
function shareFilesSupported(){
  return !!(navigator.canShare && navigator.share && photoFile && navigator.canShare({ files: [photoFile] }));
}


function fmtTime(d){
  if(!d) return '-';
  return d.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

function inputFocused(){
  const a = document.activeElement;
  return a && ['INPUT','TEXTAREA','SELECT'].includes(a.tagName);
}

function firebaseConfigured(){
  return !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);
}

// ---------- Datenzugriff ----------

async function mutateShared(key, current, mutator){
  try{
    const upd = await mutate(key, current, mutator);
    statusMsg = '';
    lastSync = new Date();
    return upd;
  }catch(e){
    console.error(e);
    statusMsg = 'Änderung konnte nicht gespeichert werden. Bitte kurz erneut versuchen.';
    return current;
  }
}

function onStoreChange(key, value){
  if(key === 'inventory' && value !== null) inventory = value;
  if(key === 'recipes' && value !== null) recipes = value;
  if(key === 'weekplan' && value !== null) weekplan = value;
  if(key === 'shopping' && value !== null) shopping = value;
  if(key === 'meta' && value !== null) meta = value;
  receivedKeys.add(key);
  if(!ready && DATA_KEYS.every(k => receivedKeys.has(k))){
    ready = true;
  }
  lastSync = new Date();
  scheduleRender();
}

function onStoreStatus(msg){
  statusMsg = msg;
  scheduleRender();
}


// ---------- Fachlogik ----------

function ingredientAvailable(ingName){
  const q = ingName.trim().toLowerCase();
  if(!q) return false;
  return inventory.some(item => {
    const n = item.name.trim().toLowerCase();
    return n.includes(q) || q.includes(n);
  });
}

function missingIngredients(recipe){
  return recipe.ingredients.filter(ing => !ingredientAvailable(ing.name));
}

// Liefert die Zubereitungsschritte eines Rezepts. Neue KI-Rezepte haben ein "steps"-Feld;
// ältere und manuell angelegte Rezepte haben nur "notes" – die werden dann in Zeilen bzw.
// Sätze zerlegt, damit jedes Rezept einen brauchbaren Kochmodus hat.
function recipeSteps(r){
  if(Array.isArray(r.steps) && r.steps.length) return r.steps.filter(Boolean);
  const n = String(r.notes || '').trim();
  if(!n) return [];
  const byLines = n.split('\n').map(s => s.trim()).filter(Boolean);
  if(byLines.length > 1) return byLines;
  return n.split(/\.\s+/).map(s => s.trim()).filter(Boolean)
    .map(s => /[.!?]$/.test(s) ? s : s + '.');
}

function availabilityBadge(recipe){
  const total = recipe.ingredients.length;
  if(total === 0) return {cls:'partial', text:'keine Zutaten hinterlegt'};
  const missing = missingIngredients(recipe).length;
  const have = total - missing;
  if(missing === 0) return {cls:'full', text: 'alles da'};
  if(have === 0) return {cls:'none', text: have + ' von ' + total + ' vorrätig'};
  return {cls:'partial', text: have + ' von ' + total + ' vorrätig'};
}


function itemCategory(item){
  return (item.category && CATEGORIES.includes(item.category)) ? item.category : 'Sonstiges';
}

// Packungsgröße für einen Artikelnamen: zuerst die gemerkte (meta.packSizes), sonst ein
// üblicher Vorschlag, sonst nichts. Rückgabe {size, unit} oder null.
function packHint(name){
  const key = String(name || '').trim().toLowerCase();
  const saved = meta && meta.packSizes && meta.packSizes[key];
  if(saved && saved.size) return saved;
  return suggestPackSize(name);
}

// Ergänzt einen neuen Vorratsartikel um die Packungsgröße, wenn die Einheit ein Gebinde ist.
function withPackSize(item){
  if(!isItemUnit(item.unit) || item.packSize) return item;
  const hint = packHint(item.name);
  return hint ? { ...item, packSize: hint.size, packUnit: hint.unit } : item;
}

function unitSelectOptions(current){
  const cur = String(current || '').trim();
  const known = UNIT_OPTIONS.includes(canonicalUnit(cur)) ? canonicalUnit(cur) : null;
  const opts = ['', ...UNIT_OPTIONS];
  if(cur && !known) opts.push(cur);
  const sel = known !== null ? known : cur;
  return opts.map(u => `<option value="${escapeHtml(u)}" ${u===sel?'selected':''}>${u ? escapeHtml(u) : '(ohne)'}</option>`).join('');
}

function openShoppingCount(){
  return shopping.filter(s => !s.checked).length;
}


// ---------- Kochmodus ----------

// Bildschirm während des Kochens anlassen; wird nicht überall unterstützt (dann still ignorieren).
async function requestWakeLock(){
  try{
    if(navigator.wakeLock && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
  }catch(e){ /* nicht unterstützt oder abgelehnt – Kochmodus funktioniert trotzdem */ }
}

async function releaseWakeLock(){
  try{
    if(wakeLock){ await wakeLock.release(); }
  }catch(e){ /* egal */ }
  wakeLock = null;
}

function openCookMode(id){
  cookingRecipeId = id;
  cookChecked = new Set();
  cookStepsDone = new Set();
  requestWakeLock();
  window.scrollTo(0, 0);
  render();
}

function closeCookMode(){
  cookingRecipeId = null;
  releaseWakeLock();
  render();
}

function renderCookMode(){
  const r = recipes.find(x => x.id === cookingRecipeId);
  if(!r){ cookingRecipeId = null; return ''; }
  const effort = r.aufwand ? `<span class="effort-badge">${r.aufwand==='aufwändig'?'aufwändig':'schnell'}${r.zeit?' · '+escapeHtml(r.zeit):''}</span>` : '';

  const ingHtml = r.ingredients.length
    ? r.ingredients.map((i, idx) => {
        const done = cookChecked.has(idx);
        const miss = !ingredientAvailable(i.name);
        const qty = i.amount ? escapeHtml(String(i.amount)) + (i.unit ? ' ' + escapeHtml(i.unit) : '') : '';
        return `
          <li class="cook-ing ${done?'done':''}" data-action="toggle-cook-ing" data-idx="${idx}">
            <span class="cook-check">${done ? '✓' : ''}</span>
            <span class="cook-ing-text">${escapeHtml(i.name)}${qty ? ' <span class="cook-qty">'+qty+'</span>' : ''}</span>
            ${miss ? '<span class="cook-miss">fehlt</span>' : ''}
          </li>`;
      }).join('')
    : '<li class="empty-note">Keine Zutaten hinterlegt.</li>';

  const steps = recipeSteps(r);
  const stepsHtml = steps.length
    ? steps.map((s, idx) => {
        const done = cookStepsDone.has(idx);
        return `
          <li class="cook-step ${done?'done':''}" data-action="toggle-cook-step" data-idx="${idx}">
            <span class="cook-step-no">${idx+1}</span>
            <span class="cook-step-text">${escapeHtml(s)}</span>
          </li>`;
      }).join('')
    : '<li class="empty-note">Für dieses Rezept ist noch keine Zubereitung hinterlegt.</li>';

  return `
    <div class="cook-mode">
      <div class="cook-head">
        <button class="btn small secondary" data-action="close-cook">← Zurück</button>
        <h1 class="cook-title">${escapeHtml(r.name)}${effort}</h1>
      </div>
      <div class="cook-card">
        <h2>Zutaten</h2>
        <div class="cook-hint">Zum Abhaken antippen.</div>
        <ul class="cook-ings">${ingHtml}</ul>
      </div>
      <div class="cook-card">
        <h2>Zubereitung</h2>
        <div class="cook-hint">Erledigten Schritt antippen.</div>
        <ol class="cook-steps">${stepsHtml}</ol>
      </div>
      <div class="cook-foot">
        <button class="btn secondary" data-action="close-cook">Kochmodus beenden</button>
      </div>
    </div>
  `;
}

// ---------- Rendering ----------

function scheduleRender(){
  if(inputFocused()){ pendingRender = true; return; }
  render();
}

function render(){
  pendingRender = false;
  const app = document.getElementById('app');
  if(firebaseConfigured() && !householdCode){ app.innerHTML = renderHouseholdScreen(); return; }
  if(!ready){ app.innerHTML = '<div class="loading">Vorratsregal wird geladen ...</div>'; return; }
  if(cookingRecipeId){
    const cook = renderCookMode();
    if(cook){ app.innerHTML = cook; return; }
  }
  const openCount = openShoppingCount();
  const modeNote = storeMode() === 'firebase'
    ? 'Gemeinsame Liste – Änderungen erscheinen sofort auf allen Geräten.'
    : 'Lokaler Modus: Daten nur auf diesem Gerät (Firebase noch nicht eingerichtet).';
  app.innerHTML = `
    <div class="app-header">
      <div>
        <h1>Küchenvorrat</h1>
        <p>${modeNote}</p>
      </div>
      <div class="sync-row">
        <span class="sync-time"><span class="sync-dot ${online ? '' : 'offline'}"></span>${online ? 'Stand: ' + fmtTime(lastSync) : 'Offline – Änderungen werden nachgereicht'}</span>
      </div>
    </div>
    <div class="status-banner">${statusMsg ? escapeHtml(statusMsg) : ''}</div>
    <nav class="tabs">
      <button data-action="switch-tab" data-tab="vorrat" class="${activeTab==='vorrat'?'active':''}">Vorrat</button>
      <button data-action="switch-tab" data-tab="rezepte" class="${activeTab==='rezepte'?'active':''}">Rezepte</button>
      <button data-action="switch-tab" data-tab="wochenplan" class="${activeTab==='wochenplan'?'active':''}">Wochenplan</button>
      <button data-action="switch-tab" data-tab="einkauf" class="${activeTab==='einkauf'?'active':''}">Einkauf${openCount ? '<span class="tab-count">'+openCount+'</span>' : ''}</button>
    </nav>
    <div class="panel ${activeTab==='vorrat'?'active':''}">${renderVorrat()}</div>
    <div class="panel ${activeTab==='rezepte'?'active':''}">${renderRezepte()}</div>
    <div class="panel ${activeTab==='wochenplan'?'active':''}">${renderWochenplan()}</div>
    <div class="panel ${activeTab==='einkauf'?'active':''}">${renderEinkauf()}</div>
    ${renderFooterTools()}
  `;
}

function renderHouseholdScreen(){
  return `
    <div class="card setup-card">
      <h2>Willkommen beim Küchenvorrat</h2>
      <p>Gebt hier euren gemeinsamen <strong>Haushalts-Code</strong> ein. Beide Personen müssen exakt denselben Code verwenden – er verbindet eure Geräte mit derselben Vorratsliste.</p>
      <p style="color:var(--ink-soft); font-size:13px;">Beim allerersten Start denkt ihr euch den Code selbst aus (mindestens 6 Zeichen, gerne länger – er wirkt wie ein Passwort). Merkt ihn euch gut.</p>
      <div class="add-row">
        <input type="text" id="household-input" placeholder="z. B. unser-geheimer-vorrat-2026" autocomplete="off">
      </div>
      <div class="add-row" style="margin-top:10px;">
        <button class="btn" data-action="save-household">Loslegen</button>
      </div>
      <div class="ai-error" id="household-error"></div>
    </div>
  `;
}

// Kleiner Zusatz unter dem Artikelnamen: Inhalt je Packung bzw. Hinweis, dass er fehlt.
function packInfoHtml(i){
  if(!isItemUnit(i.unit)) return '';
  if(parseAmount(i.packSize)){
    return `<span class="item-sub">je ${escapeHtml(formatQuantity(i.packSize, i.packUnit || 'g'))}</span>`;
  }
  return '<span class="item-sub warn">Inhalt je Packung eintragen (✎)</span>';
}

// Eine Vorratszeile: normal (großer Stepper + Bearbeiten) oder als Bearbeiten-Formular.
function renderItemRow(i){
  if(i.id === editingItemId) return renderItemEdit(i);
  return `
    <div class="item-row" data-item-id="${i.id}">
      <span class="item-name">${escapeHtml(i.name)}${packInfoHtml(i)}</span>
      <span class="item-stepper">
        <button class="step-btn" data-action="dec-item" aria-label="Menge verringern">−</button>
        <span class="item-qty">${escapeHtml(formatQuantity(i.amount, i.unit))}</span>
        <button class="step-btn" data-action="inc-item" aria-label="Menge erhöhen">+</button>
      </span>
      <button class="edit-btn" data-action="edit-item" aria-label="Artikel bearbeiten" title="Bearbeiten: Ort, Kategorie, löschen">✎</button>
    </div>
  `;
}

// Inline-Formular zum Ändern von Name, Menge, Einheit, Lagerort und Kategorie eines Artikels.
function renderItemEdit(i){
  const locOpts = LOCATIONS.map(l => `<option value="${escapeHtml(l)}" ${l===i.location?'selected':''}>${escapeHtml(l)}</option>`).join('');
  const catOpts = CATEGORIES.map(c => `<option value="${escapeHtml(c)}" ${c===itemCategory(i)?'selected':''}>${escapeHtml(c)}</option>`).join('');
  return `
    <div class="item-row editing" data-item-id="${i.id}">
      <div class="item-edit">
        <input type="text" class="edit-name" value="${escapeHtml(i.name)}" placeholder="Artikel">
        <div class="edit-line">
          <input type="number" class="qty-input edit-amount" value="${escapeHtml(String(i.amount))}" min="0" step="any" placeholder="Menge">
          <select class="unit-select edit-unit" data-action="edit-unit-change">${unitSelectOptions(i.unit)}</select>
        </div>
        <div class="edit-line edit-pack" ${isItemUnit(i.unit) ? '' : 'hidden'}>
          <span class="pack-label">1 ${escapeHtml(canonicalUnit(i.unit) || 'Packung')} enthält</span>
          <input type="number" class="qty-input edit-pack-size" value="${escapeHtml(String(i.packSize || ''))}" min="0" step="any" placeholder="z. B. 500">
          <select class="unit-select edit-pack-unit">
            ${['g', 'ml', 'stk'].map(u => `<option value="${u}" ${(i.packUnit || 'g')===u?'selected':''}>${u}</option>`).join('')}
          </select>
        </div>
        <div class="edit-line">
          <label class="edit-field"><span>Lagerort</span><select class="edit-loc">${locOpts}</select></label>
          <label class="edit-field"><span>Kategorie</span><select class="edit-cat">${catOpts}</select></label>
        </div>
        <div class="edit-actions">
          <button class="btn small" data-action="save-item-edit">Speichern</button>
          <button class="btn small secondary" data-action="cancel-item-edit">Abbrechen</button>
          <button class="btn small danger" data-action="delete-item-edit">Löschen</button>
        </div>
      </div>
    </div>
  `;
}

// Namenstreffer haben Vorrang: Passt der Suchbegriff auf mindestens einen Artikelnamen,
// wird nur nach Namen gefiltert. Sonst greift die Suche zusätzlich auf Kategorie und
// Einheit zu (damit z. B. „Milchprodukte" die ganze Kategorie findet).
function invSearchMode(){
  const q = invSearch.trim().toLowerCase();
  if(!q) return { q: '', nameOnly: false };
  return { q, nameOnly: inventory.some(i => i.name.toLowerCase().includes(q)) };
}

function invMatches(i, q, nameOnly){
  if(!q) return true;
  if(nameOnly) return i.name.toLowerCase().includes(q);
  return (i.name + ' ' + itemCategory(i) + ' ' + (i.unit || '')).toLowerCase().includes(q);
}

function invSearchInfo(){
  const { q, nameOnly } = invSearchMode();
  if(!q) return '';
  const n = inventory.filter(i => invMatches(i, q, nameOnly)).length;
  if(n === 0) return 'Keine Treffer für „' + invSearch.trim() + '".';
  return n + ' Treffer von ' + inventory.length + ' Artikeln.';
}

// Die Lagerort-Blöcke. Bei aktiver Suche werden nur Treffer gezeigt, Kategorien sind
// dann immer aufgeklappt und die Hinzufügen-Zeilen ausgeblendet.
function renderLocBlocks(){
  const { q, nameOnly } = invSearchMode();
  const searching = q.length > 0;

  const blocks = LOCATIONS.map(loc => {
    const items = inventory.filter(i => i.location === loc && invMatches(i, q, nameOnly));
    if(searching && items.length === 0) return '';
    let inner;
    if(items.length){
      const groups = CATEGORIES.filter(cat => items.some(i => itemCategory(i) === cat));
      inner = groups.map(cat => {
        const collapsed = !searching && collapsedCats.has(loc + '|' + cat);
        const catItems = items.filter(i => itemCategory(i) === cat);
        const rows = collapsed ? '' : catItems.map(renderItemRow).join('');
        const head = searching
          ? `<div class="cat-head static"><span>${escapeHtml(cat)} (${catItems.length})</span></div>`
          : `<div class="cat-head" data-action="toggle-cat" data-loc="${loc}" data-cat="${escapeHtml(cat)}">
               <span>${escapeHtml(cat)} (${catItems.length})</span><span class="cat-toggle">${collapsed ? '▸' : '▾'}</span>
             </div>`;
        return head + rows;
      }).join('');
    } else {
      inner = '<div class="empty-note">Noch nichts eingetragen.</div>';
    }

    const addRow = searching ? '' : `
        <div class="add-row">
          <input type="text" placeholder="Artikel" class="new-item-name" data-loc="${loc}">
          <input type="number" placeholder="Menge" class="qty-input new-item-qty" data-loc="${loc}" value="1" min="0">
          <select class="unit-select new-item-unit" data-loc="${loc}">${unitSelectOptions('')}</select>
          <select class="new-item-cat" data-loc="${loc}">
            ${CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
          <button class="btn small" data-action="add-item" data-loc="${loc}">Hinzufügen</button>
        </div>`;

    return `
      <div class="loc-block">
        <span class="loc-label">${loc}</span>
        ${inner}
        ${addRow}
      </div>
    `;
  }).join('');

  if(searching && !blocks.trim()){
    return '<div class="empty-note">Kein Artikel gefunden. Tipp: Suche leeren, um wieder alles zu sehen.</div>';
  }
  return blocks;
}

// Aktualisiert nur Liste, Trefferanzeige und Leeren-Knopf – nicht die ganze Seite,
// damit das Suchfeld beim Tippen den Fokus und die Cursorposition behält.
function refreshInvSearchView(){
  const grid = document.getElementById('loc-grid');
  if(grid) grid.innerHTML = renderLocBlocks();
  const info = document.getElementById('inv-search-count');
  if(info) info.textContent = invSearchInfo();
  const clr = document.getElementById('clear-inv-search');
  if(clr) clr.hidden = !invSearch.trim();
}

function renderVorrat(){
  return `
    <div class="card">
      <h2>Einkauf schnell erfassen</h2>
      <div class="status-line" style="margin-bottom:8px;">Eine Zeile pro Artikel, z. B. „2 kg Kartoffeln" oder einfach „Milch". Beim Sprechen nach jedem Artikel kurz Pause machen – jeder Artikel wird dann eine eigene Zeile.</div>
      <div class="capture-row">
        <button class="btn small ${voiceListening ? 'secondary' : ''}" data-action="toggle-voice">${voiceListening ? '■ Aufnahme stoppen' : '🎤 Einkauf sprechen'}</button>
        <span class="voice-interim ${voiceListening ? 'live' : ''}" id="voice-interim">${voiceListening ? 'Höre zu … nach jedem Artikel kurz Pause machen' : ''}</span>
      </div>
      ${voiceError ? `<div class="ai-error">${escapeHtml(voiceError)}</div>` : ''}
      <textarea id="bulk-add-text" rows="3" placeholder="2 kg Kartoffeln&#10;3 Dosen Kichererbsen&#10;Milch">${escapeHtml(bulkDraft)}</textarea>
      <div class="add-row" style="margin-top:8px;">
        <select id="bulk-add-loc">${LOCATIONS.map(l => `<option value="${l}">${l}</option>`).join('')}</select>
        <select id="bulk-add-cat">${CATEGORIES.map(c => `<option value="${escapeHtml(c)}" ${c==='Sonstiges'?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select>
        <button class="btn small" data-action="bulk-add">Übernehmen</button>
      </div>
    </div>
    <div class="card">
      <h2>Einkauf per Foto erfassen</h2>
      ${renderPhotoBox()}
    </div>
    <div class="card">
      <h2>Was wir gerade da haben</h2>
      <div class="search-row">
        <input type="search" id="inv-search" placeholder="🔍 Vorrat durchsuchen – z. B. Milch" value="${escapeHtml(invSearch)}" autocomplete="off">
        <button class="btn small secondary" id="clear-inv-search" data-action="clear-inv-search" ${invSearch.trim() ? '' : 'hidden'}>Suche leeren</button>
      </div>
      <div class="status-line" id="inv-search-count">${escapeHtml(invSearchInfo())}</div>
      <div class="loc-grid" id="loc-grid">${renderLocBlocks()}</div>
    </div>
  `;
}

function renderPhotoBox(){
  let previewHtml = '';
  if(photoItems && photoItems.length){
    const rows = photoItems.map((p, idx) => `
      <div class="photo-item" data-idx="${idx}">
        <span class="photo-item-name">${escapeHtml(p.name)}${p.amount ? ' – ' + escapeHtml(String(p.amount)) + (p.unit ? ' ' + escapeHtml(p.unit) : '') : ''}</span>
        <select data-action="photo-item-loc" data-idx="${idx}">
          ${LOCATIONS.map(l => `<option value="${escapeHtml(l)}" ${l===p.location?'selected':''}>${escapeHtml(l)}</option>`).join('')}
        </select>
        <select data-action="photo-item-cat" data-idx="${idx}">
          ${CATEGORIES.map(c => `<option value="${escapeHtml(c)}" ${c===p.category?'selected':''}>${escapeHtml(c)}</option>`).join('')}
        </select>
        <button class="item-actions" data-action="photo-item-remove" data-idx="${idx}" title="entfernen">×</button>
      </div>
    `).join('');
    previewHtml = `
      <div class="photo-preview">
        <div class="status-line" style="margin-bottom:6px;">${photoItems.length} Produkt${photoItems.length===1?'':'e'} erkannt. Lagerort und Kategorie kannst du vor dem Übernehmen noch anpassen.</div>
        ${rows}
        <div class="recipe-controls" style="margin-top:12px;">
          <button class="btn small" data-action="import-photo-items">In den Vorrat übernehmen</button>
          <button class="btn small secondary" data-action="discard-photo-items">Verwerfen</button>
        </div>
      </div>
    `;
  }
  const shotHtml = photoPreviewUrl ? `
    <div class="photo-shot">
      <img src="${photoPreviewUrl}" alt="Aufgenommenes Einkaufsfoto">
      <div class="recipe-controls" style="margin-top:0;">
        <button class="btn small" data-action="send-photo">${shareFilesSupported() ? '➜ Foto & Prompt an Claude senden' : 'Prompt kopieren'}</button>
        <button class="btn small secondary" data-action="clear-photo">Foto verwerfen</button>
      </div>
    </div>
  ` : '';
  return `
    <div class="ai-box">
      <div class="status-line" style="margin-bottom:8px;">So geht's: 1) Foto vom Einkauf aufnehmen. 2) „Foto & Prompt an Claude senden" – beides geht zusammen an deinen Claude-Account (der Prompt liegt zusätzlich in der Zwischenablage). 3) Claudes komplette Antwort hier einfügen – die erkannten Artikel landen im Vorrat.</div>
      <div class="capture-row">
        <button class="btn small" data-action="take-photo">📷 Foto aufnehmen</button>
        <button class="btn small secondary" data-action="copy-photo-prompt">Nur Prompt kopieren</button>
      </div>
      <input type="file" id="photo-file-input" accept="image/*" capture="environment" style="display:none;">
      ${shotHtml}
      <div class="recipe-controls" style="margin-top:10px;">
        <button class="btn small secondary" data-action="toggle-photo-paste">${photoPasteOpen ? 'Eingabefeld verbergen' : 'Antwort von Claude einfügen'}</button>
      </div>
      ${photoPasteOpen ? `
        <textarea id="photo-paste-area" rows="5" style="margin-top:10px;" placeholder="Hier die komplette Antwort von Claude einfügen ..."></textarea>
        <div class="recipe-controls" style="margin-top:8px;">
          <button class="btn small" data-action="import-photo-paste">Produkte erkennen</button>
        </div>
      ` : ''}
      ${photoError ? `<div class="ai-error">${escapeHtml(photoError)}</div>` : ''}
      ${previewHtml}
    </div>
  `;
}

function renderRezepte(){
  const chips = TAGS.map(t => `
    <span class="tag-chip ${recipeFilterTags.includes(t)?'selected':''}" data-action="toggle-filter-tag" data-tag="${t}">${t}</span>
  `).join('');

  let list = recipes;
  if(recipeFilterTags.length){
    list = list.filter(r => recipeFilterTags.every(t => r.tags.includes(t)));
  }
  list = [...list].sort((a,b) => missingIngredients(a).length - missingIngredients(b).length);

  const cards = list.length ? list.map(r => renderRecipeCard(r)).join('') : '<div class="empty-note">Keine Rezepte für diese Auswahl.</div>';

  return `
    <div class="card">
      <h2>Rezeptideen</h2>
      <div>${chips}</div>
      <div class="status-line">Sortiert danach, wofür am meisten schon da ist.</div>
      ${cards}
    </div>
    <div class="card">
      <h3>KI-Vorschläge über die Claude-App</h3>
      ${renderAiBox()}
    </div>
    <div class="card">
      <h3>Neues Rezept anlegen</h3>
      <div class="paste-box">
        <div class="paste-hint">Eine Zutat pro Zeile – die Menge darf vorne oder hinten stehen (z. B. „200 g Linsen", „Linsen 200 g" oder einfach „Zwiebel"). Den Gerichtsnamen oben eintragen; ist das Feld leer, wird die erste Zeile als Name genommen. Danach unten Tags wählen und speichern.</div>
        <textarea id="paste-area" rows="4" placeholder="Linsensuppe&#10;200 g rote Linsen&#10;2 Karotten&#10;1 Zwiebel"></textarea>
        <div style="margin-top:8px;"><button class="btn small secondary" data-action="parse-paste">In Formular übernehmen</button></div>
      </div>
      ${renderNewRecipeForm()}
    </div>
  `;
}

function renderAiSuggestion(s, idx){
  const missing = s.ingredients.filter(i => !ingredientAvailable(i.name)).map(i => i.name);
  const ingHtml = s.ingredients.map(i => {
    const miss = missing.includes(i.name);
    return `<li class="${miss?'miss':'have'}">${escapeHtml(i.name)}${i.amount?` (${escapeHtml(String(i.amount))}${i.unit?' '+escapeHtml(i.unit):''})`:''}</li>`;
  }).join('');
  const tagsHtml = s.tags.map(t=>`<span class="recipe-tag">${escapeHtml(t)}</span>`).join('');
  const effort = `<span class="effort-badge">${s.aufwand==='aufwändig'?'aufwändig':'schnell'}${s.zeit?' · '+escapeHtml(s.zeit):''}</span>`;
  return `
    <div class="ai-suggestion">
      <p class="recipe-title">${escapeHtml(s.name)}${effort}</p>
      <div class="recipe-tags">${tagsHtml}</div>
      <ul class="ing-list">${ingHtml}</ul>
      ${s.notes ? `<div class="recipe-notes">${escapeHtml(s.notes)}</div>` : ''}
      <div class="recipe-controls">
        <button class="btn small" data-action="save-ai-suggestion" data-idx="${idx}">In Rezeptliste übernehmen</button>
      </div>
    </div>
  `;
}

function renderAiBox(){
  let suggestionsHtml = '';
  if(aiSuggestions && aiSuggestions.length){
    const groups = [
      { key:'schnell', label:'⚡ Schnell & einfach' },
      { key:'aufwändig', label:'🍲 Aufwändiger – mehr Zeit' }
    ];
    const sections = groups.map(g => {
      const items = aiSuggestions.map((s, idx) => ({s, idx})).filter(o => (o.s.aufwand || 'schnell') === g.key);
      if(!items.length) return '';
      return `<div class="ai-group-label">${g.label}</div>` + items.map(o => renderAiSuggestion(o.s, o.idx)).join('');
    }).join('');
    suggestionsHtml = sections + `
      <div class="recipe-controls" style="margin-top:12px;">
        <button class="btn small" data-action="save-all-ai">Alle in Rezeptliste übernehmen</button>
        <button class="btn small secondary" data-action="discard-ai-suggestions">Vorschläge verwerfen</button>
      </div>
    `;
  }
  return `
    <div class="ai-box">
      <div class="status-line" style="margin-bottom:8px;">So geht's: 1) „Prompt kopieren" und in der Claude-App einfügen – das schickt nur euren aktuellen Vorrat, noch keine Anfrage. 2) Sag Claude im Chat individuell, worauf du Lust hast oder was du kochen möchtest – Claude antwortet mit einer lesbaren Kochmodus-Fassung zum Nachkochen, gefolgt von einem technischen Datenblock. 3) Claudes GESAMTE Antwort kopieren (beide Teile) und hier einfügen – die App holt sich automatisch nur die Daten heraus und macht daraus eine Karte im Kochmodus mit Mengenangaben in Gramm/Milliliter. Tipp: Falls Claude nur den technischen Block ohne lesbaren Text schickt, einfach kurz antworten „Bitte im vereinbarten Kochmodus-Format" – das reicht meist schon.</div>
      <div class="recipe-controls">
        <button class="btn small" data-action="copy-ai-prompt">Prompt kopieren</button>
        <button class="btn small secondary" data-action="toggle-ai-paste">${aiPasteOpen ? 'Eingabefeld verbergen' : 'Antwort einfügen'}</button>
      </div>
      ${aiPasteOpen ? `
        <textarea id="ai-paste-area" rows="5" style="margin-top:10px;" placeholder="Hier die komplette Antwort von Claude einfügen ..."></textarea>
        <div class="recipe-controls" style="margin-top:8px;">
          <button class="btn small" data-action="import-ai-paste">Vorschläge importieren</button>
        </div>
      ` : ''}
      ${aiError ? `<div class="ai-error">${escapeHtml(aiError)}</div>` : ''}
      ${suggestionsHtml}
    </div>
  `;
}

function renderRecipeCard(r){
  const badge = availabilityBadge(r);
  const missing = missingIngredients(r).map(i=>i.name);
  const ingItems = r.ingredients.map(i => {
    const miss = missing.includes(i.name);
    return `<li class="${miss?'miss':'have'}">${escapeHtml(i.name)}${i.amount?` (${escapeHtml(String(i.amount))}${i.unit?' '+escapeHtml(i.unit):''})`:''}</li>`;
  }).join('');
  const tagsHtml = r.tags.map(t => `<span class="recipe-tag">${escapeHtml(t)}</span>`).join('');
  const effort = r.aufwand ? `<span class="effort-badge">${r.aufwand==='aufwändig'?'aufwändig':'schnell'}${r.zeit?' · '+escapeHtml(r.zeit):''}</span>` : '';

  return `
    <div class="recipe-card" data-recipe-id="${r.id}">
      <div class="recipe-top">
        <p class="recipe-title">${escapeHtml(r.name)}${effort}</p>
        <span class="avail-badge ${badge.cls}">${badge.text}</span>
      </div>
      <div class="recipe-tags">${tagsHtml}</div>
      <ul class="ing-list">${ingItems}</ul>
      ${r.notes ? `<div class="recipe-notes">${escapeHtml(r.notes)}</div>` : ''}
      <div class="recipe-controls">
        <button class="btn small" data-action="cook-recipe" data-id="${r.id}">👨‍🍳 Kochen</button>
        <button class="btn small secondary" data-action="plan-recipe" data-id="${r.id}">Für Wochenplan vormerken</button>
        <button class="btn small secondary" data-action="del-recipe" data-id="${r.id}">Löschen</button>
      </div>
    </div>
  `;
}

function renderNewRecipeForm(){
  const chips = TAGS.map(t => `
    <span class="tag-chip ${draftTags.includes(t) ? 'selected':''}" data-action="toggle-draft-tag" data-tag="${t}">${t}</span>
  `).join('');

  const ingRows = draftIngredients.map((ing, idx) => `
    <div class="ing-form-row">
      <input type="text" value="${escapeHtml(ing.name)}" placeholder="Zutat" data-action="draft-ing-name" data-idx="${idx}">
      <input type="text" class="qty-input" value="${escapeHtml(ing.amount||'')}" placeholder="Menge" data-action="draft-ing-amount" data-idx="${idx}">
      <input type="text" class="unit-input" value="${escapeHtml(ing.unit||'')}" placeholder="Einheit" data-action="draft-ing-unit" data-idx="${idx}">
      <button class="btn small secondary" data-action="remove-draft-ing" data-idx="${idx}">×</button>
    </div>
  `).join('');

  return `
    <div class="new-recipe-form">
      <input type="text" id="new-recipe-name" placeholder="Name des Gerichts" value="${escapeHtml(draftName)}">
      <div>${chips}</div>
      <div id="draft-ing-rows">${ingRows}</div>
      <div><button class="btn small secondary" data-action="add-draft-ing">+ Zutat</button></div>
      <textarea id="new-recipe-notes" placeholder="Zubereitung – ein Schritt pro Zeile (erscheint so im Kochmodus)" rows="3">${escapeHtml(draftNotes)}</textarea>
      <div><button class="btn" data-action="save-recipe">Rezept speichern</button></div>
    </div>
  `;
}

function renderWochenplan(){
  const days = DAYS.map(day => {
    const recipeId = weekplan[day];
    const recipe = recipes.find(r => r.id === recipeId);
    const options = recipes.map(r => `<option value="${r.id}" ${r.id===recipeId?'selected':''}>${escapeHtml(r.name)}</option>`).join('');
    let inner = '';
    if(recipe){
      const missing = missingIngredients(recipe);
      inner = missing.length
        ? `<div class="status-line" style="margin-top:6px;">Fehlt noch: ${missing.map(i=>escapeHtml(i.name)).join(', ')}</div>`
        : `<div class="status-line" style="margin-top:6px; color:#5B7A52;">Alles vorrätig</div>`;
    }
    return `
      <div class="day-block">
        <div class="day-head">
          <span class="day-name">${day}</span>
          <select data-action="set-day-recipe" data-day="${day}">
            <option value="">(kein Gericht)</option>
            ${options}
          </select>
        </div>
        ${inner}
      </div>
    `;
  }).join('');

  const missingNames = plannedMissingNames();
  const alreadyListed = new Set(shopping.map(s => s.name.trim().toLowerCase()));
  const newNames = missingNames.filter(n => !alreadyListed.has(n.trim().toLowerCase()));
  const missingHtml = missingNames.length
    ? `<ul class="shopping-list">${missingNames.map(n=>`<li><span class="shop-name">${escapeHtml(n)}</span>${alreadyListed.has(n.trim().toLowerCase())?'<span class="shop-src">schon auf der Liste</span>':''}</li>`).join('')}</ul>
       <div class="recipe-controls" style="margin-top:10px;">
         <button class="btn small" data-action="missing-to-shopping" ${newNames.length===0?'disabled':''}>${newNames.length ? newNames.length + ' fehlende Zutaten auf die Einkaufsliste' : 'Alles schon auf der Einkaufsliste'}</button>
       </div>`
    : '<div class="empty-note">Für die geplanten Gerichte ist alles da, oder es ist noch nichts geplant.</div>';

  return `
    <div class="card">
      <h2>Wochenplan</h2>
      ${days}
      <div class="recipe-controls" style="margin-top:6px;">
        <button class="btn small secondary" data-action="clear-weekplan">Woche zurücksetzen</button>
      </div>
    </div>
    <div class="card">
      <h3>Fehlende Zutaten für die geplante Woche</h3>
      ${missingHtml}
    </div>
  `;
}

function plannedMissingNames(){
  const plannedRecipes = Object.values(weekplan).map(id => recipes.find(r=>r.id===id)).filter(Boolean);
  const missingMap = {};
  plannedRecipes.forEach(r => missingIngredients(r).forEach(ing => {
    const key = ing.name.trim().toLowerCase();
    if(!missingMap[key]) missingMap[key] = ing.name;
  }));
  return Object.values(missingMap);
}

function renderEinkauf(){
  const open = shopping.filter(s => !s.checked);
  const done = shopping.filter(s => s.checked);
  const row = (s) => `
    <li class="${s.checked?'checked':''}">
      <input type="checkbox" data-action="toggle-shop" data-id="${s.id}" ${s.checked?'checked':''}>
      <span class="shop-name">${escapeHtml(s.name)}${s.amount ? ' – ' + escapeHtml(String(s.amount)) + (s.unit ? ' ' + escapeHtml(s.unit) : '') : ''}</span>
      ${s.source === 'plan' ? '<span class="shop-src">Wochenplan</span>' : ''}
      <span class="item-actions"><button data-action="del-shop" data-id="${s.id}" title="entfernen">×</button></span>
    </li>
  `;
  const listHtml = shopping.length
    ? `<ul class="shopping-list">${open.map(row).join('')}${done.map(row).join('')}</ul>`
    : '<div class="empty-note">Die Einkaufsliste ist leer.</div>';

  return `
    <div class="card">
      <h2>Einkaufsliste</h2>
      <div class="status-line">Wird von beiden geteilt – abhaken geht auch im Laden. Fehlende Zutaten aus dem Wochenplan landen hier per Knopfdruck.</div>
      ${listHtml}
      <div class="add-row" style="margin-top:12px;">
        <input type="text" id="new-shop-name" placeholder="Artikel">
        <input type="text" class="qty-input" id="new-shop-amount" placeholder="Menge">
        <input type="text" class="unit-input" id="new-shop-unit" placeholder="Einheit">
        <button class="btn small" data-action="add-shop">Hinzufügen</button>
      </div>
      <div class="recipe-controls" style="margin-top:14px;">
        <button class="btn small" data-action="shop-to-inventory" ${done.length===0?'disabled':''}>Abgehakte in den Vorrat übernehmen</button>
        <button class="btn small secondary" data-action="clear-done-shop" ${done.length===0?'disabled':''}>Abgehakte entfernen</button>
      </div>
      <div class="status-line" style="margin-top:8px;">„In den Vorrat übernehmen" legt die Artikel im Vorratsschrank unter „Sonstiges" ab – Lagerort und Kategorie lassen sich dort anpassen.</div>
    </div>
  `;
}

function renderFooterTools(){
  return `
    <div class="footer-tools">
      <button class="btn small secondary" data-action="export-json">Daten sichern (Export)</button>
      <button class="btn small secondary" data-action="import-json">Sicherung einspielen (Import)</button>
      ${firebaseConfigured() ? '<button class="btn small secondary" data-action="change-household">Haushalts-Code ändern</button>' : ''}
      <input type="file" id="import-file" accept="application/json,.json" style="display:none;">
      <span class="footer-note">Alle Daten liegen ${storeMode()==='firebase' ? 'sicher in eurer gemeinsamen Cloud-Datenbank' : 'derzeit nur lokal auf diesem Gerät'}. App-Updates verändern gespeicherte Vorräte nie.</span>
    </div>
  `;
}

// ---------- Aktionen ----------

async function addItem(loc){
  const nameInput = document.querySelector(`.new-item-name[data-loc="${loc}"]`);
  const qtyInput = document.querySelector(`.new-item-qty[data-loc="${loc}"]`);
  const unitInput = document.querySelector(`.new-item-unit[data-loc="${loc}"]`);
  const catInput = document.querySelector(`.new-item-cat[data-loc="${loc}"]`);
  const name = nameInput.value.trim();
  if(!name) return;
  const newItem = withPackSize({ id: uid(), name, amount: qtyInput.value || '1', unit: canonicalUnit(unitInput.value), location: loc, category: catInput.value });
  inventory = await mutateShared('inventory', inventory, (inv) => { inv.push(newItem); return inv; });
  render();
}

async function bulkAdd(){
  const ta = document.getElementById('bulk-add-text');
  const loc = document.getElementById('bulk-add-loc').value;
  const cat = document.getElementById('bulk-add-cat').value;
  const lines = (ta ? ta.value : bulkDraft).split('\n').map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return;
  const newItems = lines.map(parseIngredientLine).filter(Boolean).map(p => withPackSize({
    id: uid(), name: p.name, amount: p.amount || '1', unit: canonicalUnit(p.unit), location: loc, category: cat
  }));
  inventory = await mutateShared('inventory', inventory, (inv) => { newItems.forEach(it => inv.push(it)); return inv; });
  bulkDraft = '';
  statusMsg = newItems.length + (newItems.length === 1 ? ' Artikel' : ' Artikel') + ' hinzugefügt.';
  render();
}

async function changeItem(id, action){
  inventory = await mutateShared('inventory', inventory, (inv) => {
    const item = inv.find(i => i.id === id);
    if(!item) return inv;
    if(action === 'del-item') return inv.filter(i => i.id !== id);
    // Schrittweite richtet sich nach der Einheit (g/ml ±50, kg/l ±0,5, Stück/Packung ±1).
    let n = parseAmount(item.amount) || 0;
    const step = stepFor(item.unit);
    n += action === 'inc-item' ? step : -step;
    if(n <= 0.0001) return inv.filter(i => i.id !== id);
    item.amount = Math.round(n * 1000) / 1000;
    return inv;
  });
  render();
}

// Artikel-Bearbeitung übernehmen: aktualisiert nur den einen Datensatz (Read-before-write
// über mutateShared), inklusive Lagerort- und Kategorie-Wechsel.
async function saveItemEdit(id){
  const row = document.querySelector(`.item-row.editing[data-item-id="${id}"]`);
  if(!row) return;
  const nameEl = row.querySelector('.edit-name');
  const name = nameEl.value.trim();
  if(!name){ nameEl.focus(); return; }
  const amount = row.querySelector('.edit-amount').value.trim();
  const unit = row.querySelector('.edit-unit').value.trim();
  const location = row.querySelector('.edit-loc').value;
  const category = row.querySelector('.edit-cat').value;
  const packSize = isItemUnit(unit) ? parseAmount(row.querySelector('.edit-pack-size').value) : null;
  const packUnit = row.querySelector('.edit-pack-unit').value;
  inventory = await mutateShared('inventory', inventory, (inv) => {
    const it = inv.find(x => x.id === id);
    if(it){
      it.name = name; it.amount = amount || '1'; it.unit = unit; it.location = location; it.category = category;
      if(packSize){ it.packSize = packSize; it.packUnit = packUnit; }
      else { delete it.packSize; delete it.packUnit; }
    }
    return inv;
  });
  // Packungsgröße je Artikelname merken, damit sie beim nächsten Einkauf vorbelegt ist.
  if(packSize){
    const key = name.toLowerCase();
    meta = await mutateShared('meta', meta, (m) => {
      m = m || {};
      m.packSizes = { ...(m.packSizes || {}), [key]: { size: packSize, unit: packUnit } };
      return m;
    });
  }
  editingItemId = null;
  statusMsg = 'Artikel aktualisiert.';
  render();
}

async function deleteItemEdit(id){
  if(!confirm('Diesen Artikel wirklich aus dem Vorrat löschen?')) return;
  inventory = await mutateShared('inventory', inventory, (inv) => inv.filter(x => x.id !== id));
  editingItemId = null;
  render();
}

async function saveRecipe(){
  const nameEl = document.getElementById('new-recipe-name');
  const name = nameEl.value.trim();
  if(!name){ nameEl.focus(); return; }
  // Beim Speichern jede Zutat normalisieren – so wird auch eine manuell ins Namensfeld
  // getippte Menge ("200g Mehl") noch in Name/Menge/Einheit getrennt.
  const ingredients = draftIngredients.map(normalizeIngredient).filter(i => i.name.trim());
  const notes = document.getElementById('new-recipe-notes').value.trim();
  const newRecipe = { id: uid(), name, tags: [...draftTags], ingredients, notes };
  recipes = await mutateShared('recipes', recipes, (list) => { list.push(newRecipe); return list; });
  draftIngredients = []; draftTags = []; draftName = ''; draftNotes = '';
  render();
}

async function addShoppingItem(){
  const name = document.getElementById('new-shop-name').value.trim();
  if(!name) return;
  const amount = document.getElementById('new-shop-amount').value.trim();
  const unit = canonicalUnit(document.getElementById('new-shop-unit').value);
  const it = { id: uid(), name, amount, unit, checked: false, source: 'manuell' };
  shopping = await mutateShared('shopping', shopping, (list) => { list.push(it); return list; });
  render();
}

async function shopToInventory(){
  const doneItems = shopping.filter(s => s.checked && s.name && s.name.trim());
  if(!doneItems.length) return;
  inventory = await mutateShared('inventory', inventory, (inv) => {
    doneItems.forEach(it => {
      const name = it.name.trim();
      const amount = it.amount || '1';
      const unit = canonicalUnit(it.unit);
      const existing = inv.find(x => x.name.trim().toLowerCase() === name.toLowerCase());
      // Mengen nur addieren, wenn die Einheiten zusammenpassen (1 l + 500 ml = 1,5 l);
      // sonst als eigener Artikel anlegen statt zu verfälschen oder zu verschlucken.
      const sum = existing ? addAmounts(existing.amount, existing.unit, amount, unit) : null;
      if(sum){
        existing.amount = sum.amount;
        existing.unit = sum.unit;
      } else {
        inv.push(withPackSize({ id: uid(), name, amount, unit, location: existing ? existing.location : 'Vorratsschrank', category: existing ? itemCategory(existing) : 'Sonstiges' }));
      }
    });
    return inv;
  });
  const doneIds = new Set(doneItems.map(d => d.id));
  shopping = await mutateShared('shopping', shopping, (list) => list.filter(s => !doneIds.has(s.id)));
  statusMsg = doneItems.length + ' Artikel in den Vorrat übernommen.';
  render();
}

function exportJson(){
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'kuechenvorrat',
    inventory, recipes, weekplan, shopping, meta
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kuechenvorrat-backup-' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Import ist rein additiv: fügt nur hinzu, was noch nicht existiert; löscht nie.
async function importJson(file){
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    let added = 0;
    if(Array.isArray(data.inventory)){
      inventory = await mutateShared('inventory', inventory, (inv) => {
        data.inventory.forEach(it => {
          if(!it || !it.name) return;
          const dup = inv.some(x => x.name.trim().toLowerCase() === String(it.name).trim().toLowerCase() && x.location === it.location);
          if(!dup){ inv.push({ ...it, id: it.id || uid() }); added++; }
        });
        return inv;
      });
    }
    if(Array.isArray(data.recipes)){
      recipes = await mutateShared('recipes', recipes, (list) => {
        data.recipes.forEach(r => {
          if(!r || !r.name) return;
          const dup = list.some(x => x.name.trim().toLowerCase() === String(r.name).trim().toLowerCase());
          if(!dup){ list.push({ ...r, id: r.id || uid() }); added++; }
        });
        return list;
      });
    }
    if(data.weekplan && typeof data.weekplan === 'object'){
      weekplan = await mutateShared('weekplan', weekplan, (wp) => {
        DAYS.forEach(d => { if(!wp[d] && data.weekplan[d]) wp[d] = data.weekplan[d]; });
        return wp;
      });
    }
    if(Array.isArray(data.shopping)){
      shopping = await mutateShared('shopping', shopping, (list) => {
        data.shopping.forEach(s => {
          if(!s || !s.name) return;
          const dup = list.some(x => x.name.trim().toLowerCase() === String(s.name).trim().toLowerCase());
          if(!dup){ list.push({ ...s, id: s.id || uid() }); added++; }
        });
        return list;
      });
    }
    statusMsg = 'Import abgeschlossen: ' + added + ' Einträge hinzugefügt (Bestehendes blieb unverändert).';
  }catch(e){
    console.error(e);
    statusMsg = 'Import fehlgeschlagen – ist das eine Küchenvorrat-Sicherungsdatei?';
  }
  render();
}

async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch(e2){ ok = false; }
    ta.remove();
    return ok;
  }
}

async function copyAiPrompt(){
  const ok = await copyToClipboard(buildAiPrompt(inventory));
  statusMsg = ok ? 'Prompt kopiert – jetzt in der Claude-App einfügen.' : 'Kopieren nicht möglich – bitte Text manuell markieren.';
  render();
}

async function copyPhotoPrompt(){
  const ok = await copyToClipboard(buildPhotoPrompt());
  statusMsg = ok
    ? 'Foto-Prompt kopiert – in der Claude-App einfügen und das Einkaufsfoto anhängen.'
    : 'Kopieren nicht möglich – bitte Text manuell markieren.';
  render();
}

// Erkannte Produkte in den Vorrat übernehmen. Rein additiv: legt neue Artikel an,
// bestehende Vorräte bleiben unangetastet (Datensicherheits-Prinzip).
async function importPhotoItems(){
  if(!photoItems || !photoItems.length) return;
  const toAdd = photoItems.map(p => ({
    id: uid(), name: p.name, amount: p.amount || '1', unit: p.unit || '', location: p.location, category: p.category
  }));
  inventory = await mutateShared('inventory', inventory, (inv) => { toAdd.forEach(it => inv.push(it)); return inv; });
  const n = toAdd.length;
  photoItems = null;
  photoError = '';
  if(photoPreviewUrl){ URL.revokeObjectURL(photoPreviewUrl); }
  photoFile = null;
  photoPreviewUrl = '';
  statusMsg = n + (n === 1 ? ' Artikel' : ' Artikel') + ' aus dem Foto in den Vorrat übernommen.';
  render();
}

// ---------- Foto-Aufnahme direkt in der App ----------

function handlePhotoSelected(file){
  if(!file) return;
  if(photoPreviewUrl){ URL.revokeObjectURL(photoPreviewUrl); }
  photoFile = file;
  photoPreviewUrl = URL.createObjectURL(file);
  photoError = '';
  statusMsg = 'Foto aufgenommen. Jetzt „Foto & Prompt an Claude senden".';
  render();
}

function clearPhoto(){
  if(photoPreviewUrl){ URL.revokeObjectURL(photoPreviewUrl); }
  photoFile = null;
  photoPreviewUrl = '';
  render();
}

// Foto + Prompt zusammen an die Claude-App geben (native Teilen-Funktion).
// Der Prompt wandert zusätzlich in die Zwischenablage, falls das Ziel nur das Bild übernimmt.
async function sendPhotoToClaude(){
  const prompt = buildPhotoPrompt();
  await copyToClipboard(prompt);
  if(shareFilesSupported()){
    try{
      await navigator.share({ files: [photoFile], text: prompt, title: 'Einkaufsfoto' });
      photoPasteOpen = true;
      statusMsg = 'An Claude gesendet (Prompt liegt auch in der Zwischenablage). Danach Claudes Antwort unten einfügen.';
    }catch(e){
      if(e && e.name === 'AbortError'){ return; }
      photoPasteOpen = true;
      statusMsg = 'Teilen nicht möglich – Prompt wurde kopiert. Bitte in der Claude-App einfügen und das Foto anhängen.';
    }
  } else {
    photoPasteOpen = true;
    statusMsg = 'Prompt kopiert. Öffne die Claude-App, füge den Prompt ein und hänge das aufgenommene Foto an. Danach Antwort unten einfügen.';
  }
  render();
}

// ---------- Spracheingabe (Web Speech API, komplett im Gerät) ----------

// Ein erkannter Sprech-Abschnitt (eine Äußerung) wird zu einer oder mehreren
// Artikelzeilen und live ans Erfassungsfeld angehängt.
function appendVoiceResult(text){
  const lines = spokenToLines(text);
  if(lines.length){
    bulkDraft = (bulkDraft.trim() ? bulkDraft.replace(/\s*$/,'') + '\n' : '') + lines.join('\n');
    render();
  }
}

// Ein Erkennungsdurchlauf = eine Äußerung (bis zur nächsten Sprechpause). Nach dem Ende
// wird – solange die Aufnahme läuft – automatisch neu gestartet. Dadurch wird jede Pause
// zwischen zwei Artikeln zu einer eigenen Zeile, unabhängig von Satzzeichen.
function startVoiceCycle(){
  recognition = new SpeechRec();
  recognition.lang = 'de-DE';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.onresult = (ev) => {
    let interim = '', finalPiece = '';
    for(let i = ev.resultIndex; i < ev.results.length; i++){
      const res = ev.results[i];
      if(res.isFinal) finalPiece += res[0].transcript + ' ';
      else interim += res[0].transcript;
    }
    if(finalPiece.trim()) appendVoiceResult(finalPiece);
    const el = document.getElementById('voice-interim');
    if(el) el.textContent = interim.trim() || 'Höre zu … nach jedem Artikel kurz Pause machen';
  };
  recognition.onerror = (ev) => {
    if(ev.error === 'not-allowed' || ev.error === 'service-not-allowed'){
      voiceError = 'Mikrofon-Zugriff wurde nicht erlaubt. Bitte in den Einstellungen freigeben.';
      voiceStopRequested = true;
    }
    // 'no-speech'/'aborted'/'network': onend entscheidet über Neustart.
  };
  recognition.onend = () => {
    recognition = null;
    if(voiceListening && !voiceStopRequested){
      voiceRestartTimer = setTimeout(() => { if(voiceListening && !voiceStopRequested) startVoiceCycle(); }, 250);
    } else {
      voiceListening = false;
      render();
    }
  };
  try{ recognition.start(); }
  catch(e){ /* Start knapp nach Stop kann werfen – onend regelt einen Neustart */ }
}

function startVoice(){
  voiceError = '';
  if(!voiceSupported){
    voiceError = 'Live-Spracherkennung wird auf diesem Gerät nicht unterstützt. Tipp: das Mikrofon-Symbol der Handy-Tastatur zum Diktieren ins Textfeld nutzen.';
    render();
    return;
  }
  voiceStopRequested = false;
  voiceListening = true;
  startVoiceCycle();
  render();
}

function stopVoice(){
  voiceStopRequested = true;
  voiceListening = false;
  if(voiceRestartTimer){ clearTimeout(voiceRestartTimer); voiceRestartTimer = null; }
  if(recognition){ try{ recognition.stop(); }catch(e){} }
  render();
}

// ---------- Event-Delegation ----------

function bindGlobalEvents(){
  const app = document.getElementById('app');

  app.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if(!el) return;
    const action = el.dataset.action;

    switch(action){
      case 'switch-tab': activeTab = el.dataset.tab; render(); break;
      case 'toggle-cat': {
        const key = el.dataset.loc + '|' + el.dataset.cat;
        collapsedCats.has(key) ? collapsedCats.delete(key) : collapsedCats.add(key);
        render(); break;
      }
      case 'clear-inv-search': {
        invSearch = '';
        const inp = document.getElementById('inv-search');
        if(inp){ inp.value = ''; inp.focus(); }
        refreshInvSearchView();
        break;
      }
      case 'add-item': await addItem(el.dataset.loc); break;
      case 'bulk-add': await bulkAdd(); break;
      case 'inc-item': case 'dec-item': case 'del-item': {
        const rowEl = el.closest('.item-row');
        if(rowEl) await changeItem(rowEl.dataset.itemId, action);
        break;
      }
      case 'edit-item': {
        const rowEl = el.closest('.item-row');
        if(rowEl){ editingItemId = rowEl.dataset.itemId; render(); }
        break;
      }
      case 'save-item-edit': {
        const rowEl = el.closest('.item-row');
        if(rowEl) await saveItemEdit(rowEl.dataset.itemId);
        break;
      }
      case 'cancel-item-edit': editingItemId = null; render(); break;
      case 'delete-item-edit': {
        const rowEl = el.closest('.item-row');
        if(rowEl) await deleteItemEdit(rowEl.dataset.itemId);
        break;
      }
      case 'toggle-filter-tag': {
        const t = el.dataset.tag;
        recipeFilterTags = recipeFilterTags.includes(t) ? recipeFilterTags.filter(x=>x!==t) : [...recipeFilterTags, t];
        render(); break;
      }
      case 'toggle-draft-tag': {
        const t = el.dataset.tag;
        draftTags = draftTags.includes(t) ? draftTags.filter(x=>x!==t) : [...draftTags, t];
        render(); break;
      }
      case 'add-draft-ing': draftIngredients.push({name:'',amount:'',unit:''}); render(); break;
      case 'remove-draft-ing': draftIngredients.splice(parseInt(el.dataset.idx),1); render(); break;
      case 'parse-paste': {
        const raw = document.getElementById('paste-area').value;
        const lines = raw.split('\n').map(l=>l.trim()).filter(Boolean);
        if(lines.length === 0) break;
        if(draftName.trim()){
          // Name steht schon oben -> alle Zeilen als Zutaten behandeln, Name nicht überschreiben.
          draftIngredients = lines.map(parseIngredientLine).filter(Boolean);
        } else {
          // Kein Name gesetzt -> erste Zeile ist der Gerichtsname, Rest sind Zutaten.
          draftName = lines[0];
          draftIngredients = lines.slice(1).map(parseIngredientLine).filter(Boolean);
        }
        render(); break;
      }
      case 'save-recipe': await saveRecipe(); break;
      case 'del-recipe': {
        if(!confirm('Dieses Rezept wirklich löschen?')) break;
        const id = el.dataset.id;
        recipes = await mutateShared('recipes', recipes, (list) => list.filter(r => r.id !== id));
        weekplan = await mutateShared('weekplan', weekplan, (wp) => {
          DAYS.forEach(d => { if(wp[d] === id) delete wp[d]; });
          return wp;
        });
        render(); break;
      }
      case 'cook-recipe': openCookMode(el.dataset.id); break;
      case 'close-cook': closeCookMode(); break;
      case 'toggle-cook-ing': {
        const idx = parseInt(el.dataset.idx);
        cookChecked.has(idx) ? cookChecked.delete(idx) : cookChecked.add(idx);
        render(); break;
      }
      case 'toggle-cook-step': {
        const idx = parseInt(el.dataset.idx);
        cookStepsDone.has(idx) ? cookStepsDone.delete(idx) : cookStepsDone.add(idx);
        render(); break;
      }
      case 'plan-recipe': {
        const id = el.dataset.id;
        const freeDay = DAYS.find(d => !weekplan[d]) || DAYS[0];
        weekplan = await mutateShared('weekplan', weekplan, (wp) => { wp[freeDay] = id; return wp; });
        activeTab = 'wochenplan';
        render(); break;
      }
      case 'clear-weekplan': {
        if(!confirm('Den Wochenplan wirklich leeren? (Rezepte und Vorräte bleiben erhalten)')) break;
        weekplan = await mutateShared('weekplan', weekplan, () => ({}));
        render(); break;
      }
      case 'missing-to-shopping': {
        const names = plannedMissingNames();
        shopping = await mutateShared('shopping', shopping, (list) => {
          const listed = new Set(list.map(s => s.name.trim().toLowerCase()));
          names.forEach(n => {
            if(!listed.has(n.trim().toLowerCase())){
              list.push({ id: uid(), name: n, amount: '', unit: '', checked: false, source: 'plan' });
            }
          });
          return list;
        });
        activeTab = 'einkauf';
        render(); break;
      }
      case 'add-shop': await addShoppingItem(); break;
      case 'del-shop': {
        const id = el.dataset.id;
        shopping = await mutateShared('shopping', shopping, (list) => list.filter(s => s.id !== id));
        render(); break;
      }
      case 'shop-to-inventory': await shopToInventory(); break;
      case 'clear-done-shop': {
        shopping = await mutateShared('shopping', shopping, (list) => list.filter(s => !s.checked));
        render(); break;
      }
      case 'copy-ai-prompt': await copyAiPrompt(); break;
      case 'toggle-ai-paste': aiPasteOpen = !aiPasteOpen; aiError=''; render(); break;
      case 'import-ai-paste': {
        const ta = document.getElementById('ai-paste-area');
        if(!ta || !ta.value.trim()) break;
        try{
          aiSuggestions = parseAiRecipes(ta.value);
          aiError = '';
          aiPasteOpen = false;
        }catch(err){
          console.error(err);
          aiError = 'Antwort konnte nicht gelesen werden. Bitte die komplette Claude-Antwort (mit den geschweiften Klammern) einfügen.';
        }
        render(); break;
      }
      case 'save-ai-suggestion': {
        const s = aiSuggestions && aiSuggestions[parseInt(el.dataset.idx)];
        if(!s) break;
        const newRecipe = { id: uid(), name: s.name, tags: s.tags, ingredients: s.ingredients, steps: s.steps, notes: s.notes, aufwand: s.aufwand, zeit: s.zeit };
        recipes = await mutateShared('recipes', recipes, (list) => { list.push(newRecipe); return list; });
        aiSuggestions = aiSuggestions.filter((_, i) => i !== parseInt(el.dataset.idx));
        if(aiSuggestions.length === 0) aiSuggestions = null;
        statusMsg = '„' + s.name + '" wurde in die Rezeptliste übernommen.';
        render(); break;
      }
      case 'save-all-ai': {
        if(!aiSuggestions || !aiSuggestions.length) break;
        const toAdd = aiSuggestions;
        recipes = await mutateShared('recipes', recipes, (list) => {
          const have = new Set(list.map(r => r.name.trim().toLowerCase()));
          toAdd.forEach(s => {
            if(!have.has(s.name.trim().toLowerCase())){
              list.push({ id: uid(), name: s.name, tags: s.tags, ingredients: s.ingredients, steps: s.steps, notes: s.notes, aufwand: s.aufwand, zeit: s.zeit });
            }
          });
          return list;
        });
        const n = toAdd.length;
        aiSuggestions = null;
        statusMsg = n + ' Vorschläge in die Rezeptliste übernommen.';
        render(); break;
      }
      case 'discard-ai-suggestions': aiSuggestions = null; aiError=''; render(); break;
      case 'copy-photo-prompt': await copyPhotoPrompt(); break;
      case 'take-photo': { const inp = document.getElementById('photo-file-input'); if(inp) inp.click(); break; }
      case 'clear-photo': clearPhoto(); break;
      case 'send-photo': await sendPhotoToClaude(); break;
      case 'toggle-voice': voiceListening ? stopVoice() : startVoice(); break;
      case 'toggle-photo-paste': photoPasteOpen = !photoPasteOpen; photoError=''; render(); break;
      case 'import-photo-paste': {
        const ta = document.getElementById('photo-paste-area');
        if(!ta || !ta.value.trim()) break;
        try{
          photoItems = parsePhotoItems(ta.value);
          photoError = '';
          photoPasteOpen = false;
        }catch(err){
          console.error(err);
          photoError = 'Antwort konnte nicht gelesen werden. Bitte die komplette Claude-Antwort (mit den eckigen Klammern) einfügen.';
        }
        render(); break;
      }
      case 'photo-item-remove': {
        const idx = parseInt(el.dataset.idx);
        if(photoItems){
          photoItems = photoItems.filter((_, i) => i !== idx);
          if(photoItems.length === 0) photoItems = null;
        }
        render(); break;
      }
      case 'import-photo-items': await importPhotoItems(); break;
      case 'discard-photo-items': photoItems = null; photoError=''; render(); break;
      case 'export-json': exportJson(); break;
      case 'import-json': document.getElementById('import-file').click(); break;
      case 'change-household': {
        if(!confirm('Haushalts-Code ändern? Die Daten des bisherigen Haushalts bleiben in der Cloud erhalten und sind mit dem alten Code weiter erreichbar.')) break;
        localStorage.removeItem(HOUSEHOLD_LS_KEY);
        location.reload();
        break;
      }
      case 'save-household': {
        const inp = document.getElementById('household-input');
        const err = document.getElementById('household-error');
        const code = inp.value.trim().replace(/[\/\s]+/g, '-').toLowerCase();
        if(code.length < 6){ err.textContent = 'Bitte mindestens 6 Zeichen verwenden.'; break; }
        localStorage.setItem(HOUSEHOLD_LS_KEY, code);
        householdCode = code;
        boot();
        break;
      }
    }
  });

  app.addEventListener('change', async (e) => {
    if(e.target && e.target.id === 'photo-file-input'){
      const file = e.target.files && e.target.files[0];
      if(file) handlePhotoSelected(file);
      e.target.value = '';
      return;
    }
    const el = e.target.closest('[data-action]');
    if(!el) return;
    if(el.dataset.action === 'edit-unit-change'){
      // Packungsgröße-Zeile nur bei Gebinde-Einheiten zeigen und mit dem Vorschlag vorbelegen.
      const row = el.closest('.item-row');
      const isItem = isItemUnit(el.value);
      row.querySelector('.edit-pack').hidden = !isItem;
      row.querySelector('.pack-label').textContent = '1 ' + (canonicalUnit(el.value) || 'Packung') + ' enthält';
      const sizeInput = row.querySelector('.edit-pack-size');
      if(isItem && !sizeInput.value){
        const h = packHint(row.querySelector('.edit-name').value);
        if(h){ sizeInput.value = h.size; row.querySelector('.edit-pack-unit').value = h.unit; }
      }
      return;
    }
    if(el.dataset.action === 'set-day-recipe'){
      const day = el.dataset.day;
      const val = el.value;
      weekplan = await mutateShared('weekplan', weekplan, (wp) => { if(val) wp[day]=val; else delete wp[day]; return wp; });
      render();
    }
    if(el.dataset.action === 'toggle-shop'){
      const id = el.dataset.id;
      shopping = await mutateShared('shopping', shopping, (list) => {
        const it = list.find(s => s.id === id);
        if(it) it.checked = !it.checked;
        return list;
      });
      render();
    }
    if(el.dataset.action === 'photo-item-loc' && photoItems){
      const idx = parseInt(el.dataset.idx);
      if(photoItems[idx]) photoItems[idx].location = el.value;
    }
    if(el.dataset.action === 'photo-item-cat' && photoItems){
      const idx = parseInt(el.dataset.idx);
      if(photoItems[idx]) photoItems[idx].category = el.value;
    }
  });

  app.addEventListener('input', (e) => {
    const el = e.target;
    if(el.id === 'inv-search'){ invSearch = el.value; refreshInvSearchView(); return; }
    if(el.id === 'bulk-add-text') bulkDraft = el.value;
    if(el.id === 'new-recipe-name') draftName = el.value;
    if(el.id === 'new-recipe-notes') draftNotes = el.value;
    const action = el.dataset && el.dataset.action;
    if(action && action.startsWith('draft-ing-')){
      const idx = parseInt(el.dataset.idx);
      const field = action === 'draft-ing-name' ? 'name' : action === 'draft-ing-amount' ? 'amount' : 'unit';
      if(draftIngredients[idx]) draftIngredients[idx][field] = el.value;
    }
  });

  // Manuell getippte Zutat beim Verlassen des Namensfeldes automatisch in Name/Menge/
  // Einheit aufteilen (z. B. "200g Mehl"), sofern noch keine Menge gesetzt ist.
  app.addEventListener('focusout', (e) => {
    const el = e.target;
    if(!el || el.dataset.action !== 'draft-ing-name') return;
    const idx = parseInt(el.dataset.idx);
    const ing = draftIngredients[idx];
    if(!ing) return;
    const before = ing.name + '|' + ing.amount + '|' + ing.unit;
    const norm = normalizeIngredient(ing);
    if((norm.name + '|' + norm.amount + '|' + norm.unit) !== before){
      draftIngredients[idx] = norm;
      render();
    }
  });

  document.addEventListener('change', (e) => {
    if(e.target && e.target.id === 'import-file'){
      const file = e.target.files && e.target.files[0];
      if(file) importJson(file);
      e.target.value = '';
    }
  });

  // Aufgeschobenes Rendern nachholen, sobald kein Eingabefeld mehr fokussiert ist.
  document.addEventListener('focusout', () => {
    setTimeout(() => { if(pendingRender && !inputFocused()) render(); }, 150);
  });

  window.addEventListener('online', () => { online = true; scheduleRender(); });
  window.addEventListener('offline', () => { online = false; scheduleRender(); });
}

// ---------- Start ----------

async function boot(){
  if(firebaseConfigured() && !householdCode){
    render();
    return;
  }
  const code = firebaseConfigured() ? householdCode : 'lokal';
  await initStore(code, onStoreChange, onStoreStatus);
  if(storeMode() === 'lokal' && !ready){
    // Lokaler Modus liefert alle Keys synchron; falls Speicher leer war, sind wir trotzdem startklar.
    ready = true;
    render();
  }
}

bindGlobalEvents();
boot();
