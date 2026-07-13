// Küchenvorrat – gemeinsame Vorrats-, Rezept- und Wochenplan-App.
// UI-Logik, portiert vom Claude-Artifact (referenz/kuechenvorrat-artifact.html),
// Datenzugriff über store.js (Firestore-Echtzeit-Sync bzw. lokaler Fallback).

import { initStore, mutate, storeMode, DATA_KEYS } from './store.js';

const LOCATIONS = ['Gefriertruhe', 'Vorratsschrank', 'Kühlschrank'];
const CATEGORIES = ['Fleisch & Fisch','Gemüse & Obst','Milchprodukte','Fertiggerichte','Grundnahrungsmittel','Konserven','Gewürze & Saucen','Backwaren','Getränke','Sonstiges'];
const TAGS = ['proteinreich','fettarm','ausgewogen','vegan','fleischlastig','mit Gemüse','ohne Gemüse'];
const DAYS = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const KNOWN_UNITS = ['g','kg','ml','l','tl','el','stk','stück','dose','dosen','packung','prise','bund','zehe','zehen','stange','scheibe','scheiben'];
const HOUSEHOLD_LS_KEY = 'vorrat-household';

const STARTER_RECIPES = [
  { name: 'Spaghetti Bolognese', tags: ['fleischlastig','mit Gemüse'], ingredients: [
    {name:'Spaghetti', amount:'250', unit:'g'}, {name:'Hackfleisch', amount:'400', unit:'g'},
    {name:'Zwiebel', amount:'1', unit:''}, {name:'Karotte', amount:'1', unit:''},
    {name:'Tomaten passiert', amount:'400', unit:'g'}, {name:'Knoblauch', amount:'2', unit:'Zehen'}
  ], notes: 'Gemüse klein würfeln, Hackfleisch anbraten, mit Tomaten ablöschen, 20 Min köcheln.' },
  { name: 'Linsensuppe', tags: ['vegan','proteinreich','ausgewogen'], ingredients: [
    {name:'rote Linsen', amount:'250', unit:'g'}, {name:'Karotte', amount:'2', unit:''},
    {name:'Kartoffel', amount:'2', unit:''}, {name:'Zwiebel', amount:'1', unit:''},
    {name:'Gemüsebrühe', amount:'1', unit:'l'}
  ], notes: 'Gemüse würfeln, mit Linsen und Brühe 20 Min köcheln, pürieren nach Belieben.' },
  { name: 'Gemüsepfanne mit Reis', tags: ['vegan','mit Gemüse','fettarm'], ingredients: [
    {name:'Reis', amount:'200', unit:'g'}, {name:'Paprika', amount:'2', unit:''},
    {name:'Zucchini', amount:'1', unit:''}, {name:'Sojasauce', amount:'2', unit:'EL'},
    {name:'Ingwer', amount:'1', unit:'Stück'}
  ], notes: 'Reis kochen, Gemüse scharf anbraten, mit Sojasauce abschmecken.' },
  { name: 'Kartoffelgratin', tags: ['ausgewogen','mit Gemüse'], ingredients: [
    {name:'Kartoffeln', amount:'1', unit:'kg'}, {name:'Sahne', amount:'200', unit:'ml'},
    {name:'Käse gerieben', amount:'150', unit:'g'}, {name:'Knoblauch', amount:'1', unit:'Zehe'}
  ], notes: 'Kartoffeln in Scheiben schichten, mit Sahne übergießen, Käse drauf, 45 Min überbacken.' },
  { name: 'Hähnchen-Curry mit Reis', tags: ['fleischlastig','proteinreich','mit Gemüse'], ingredients: [
    {name:'Hähnchenbrust', amount:'400', unit:'g'}, {name:'Kokosmilch', amount:'400', unit:'ml'},
    {name:'Currypaste', amount:'2', unit:'EL'}, {name:'Paprika', amount:'1', unit:''},
    {name:'Reis', amount:'200', unit:'g'}
  ], notes: 'Hähnchen anbraten, Currypaste und Kokosmilch dazu, mit Gemüse 15 Min köcheln.' },
  { name: 'Chili sin Carne', tags: ['vegan','proteinreich','mit Gemüse'], ingredients: [
    {name:'Kidneybohnen', amount:'1', unit:'Dose'}, {name:'Mais', amount:'1', unit:'Dose'},
    {name:'Tomaten stückig', amount:'400', unit:'g'}, {name:'Zwiebel', amount:'1', unit:''},
    {name:'Paprika', amount:'1', unit:''}
  ], notes: 'Zwiebel anbraten, restliche Zutaten dazu, 20 Min köcheln lassen.' },
  { name: 'Bunter Nudelsalat', tags: ['ausgewogen','mit Gemüse','fettarm'], ingredients: [
    {name:'Nudeln', amount:'250', unit:'g'}, {name:'Cherrytomaten', amount:'150', unit:'g'},
    {name:'Gurke', amount:'1', unit:''}, {name:'Feta', amount:'100', unit:'g'},
    {name:'Olivenöl', amount:'2', unit:'EL'}
  ], notes: 'Nudeln kochen, abkühlen lassen, mit Gemüse und Feta mischen.' },
  { name: 'Kichererbsen-Curry', tags: ['vegan','proteinreich','mit Gemüse'], ingredients: [
    {name:'Kichererbsen', amount:'1', unit:'Dose'}, {name:'Kokosmilch', amount:'400', unit:'ml'},
    {name:'Spinat', amount:'200', unit:'g'}, {name:'Currypulver', amount:'1', unit:'EL'},
    {name:'Zwiebel', amount:'1', unit:''}
  ], notes: 'Zwiebel andünsten, Currypulver kurz mitrösten, restliche Zutaten dazugeben, 15 Min köcheln.' },
  { name: 'Rührei mit Gemüse', tags: ['proteinreich','ausgewogen','mit Gemüse'], ingredients: [
    {name:'Eier', amount:'4', unit:''}, {name:'Paprika', amount:'1', unit:''},
    {name:'Champignons', amount:'150', unit:'g'}, {name:'Schnittlauch', amount:'1', unit:'Bund'}
  ], notes: 'Gemüse anbraten, verquirlte Eier dazugeben, unter Rühren stocken lassen.' },
  { name: 'Ofengemüse mit Feta', tags: ['ausgewogen','mit Gemüse','fettarm'], ingredients: [
    {name:'Zucchini', amount:'1', unit:''}, {name:'Paprika', amount:'2', unit:''},
    {name:'rote Zwiebel', amount:'1', unit:''}, {name:'Feta', amount:'150', unit:'g'},
    {name:'Olivenöl', amount:'2', unit:'EL'}
  ], notes: 'Gemüse in Stücke schneiden, mit Öl vermengen, 25 Min bei 200 Grad backen, Feta darüberbröseln.' },
  { name: 'Linsen-Bolognese vegan', tags: ['vegan','proteinreich','mit Gemüse'], ingredients: [
    {name:'braune Linsen', amount:'200', unit:'g'}, {name:'Tomaten passiert', amount:'400', unit:'g'},
    {name:'Karotte', amount:'1', unit:''}, {name:'Zwiebel', amount:'1', unit:''},
    {name:'Spaghetti', amount:'250', unit:'g'}
  ], notes: 'Linsen mit Gemüse und Tomaten 25 Min köcheln, mit Nudeln servieren.' },
  { name: 'Hähnchenbrust mit Brokkoli', tags: ['proteinreich','fettarm','mit Gemüse'], ingredients: [
    {name:'Hähnchenbrust', amount:'400', unit:'g'}, {name:'Brokkoli', amount:'1', unit:''},
    {name:'Reis', amount:'150', unit:'g'}, {name:'Sojasauce', amount:'1', unit:'EL'}
  ], notes: 'Hähnchen würzen und braten, Brokkoli dämpfen, mit Reis anrichten.' },
  { name: 'Kartoffelsuppe', tags: ['ausgewogen','fettarm'], ingredients: [
    {name:'Kartoffeln', amount:'800', unit:'g'}, {name:'Karotte', amount:'2', unit:''},
    {name:'Lauch', amount:'1', unit:''}, {name:'Gemüsebrühe', amount:'1', unit:'l'}
  ], notes: 'Gemüse würfeln, in Brühe weich kochen, teilweise pürieren.' },
  { name: 'Gemüseeintopf', tags: ['vegan','ausgewogen','mit Gemüse','fettarm'], ingredients: [
    {name:'Kartoffeln', amount:'3', unit:''}, {name:'Karotte', amount:'2', unit:''},
    {name:'Sellerie', amount:'1', unit:'Stange'}, {name:'Erbsen', amount:'150', unit:'g'},
    {name:'Gemüsebrühe', amount:'1', unit:'l'}
  ], notes: 'Alles klein schneiden, in Brühe 25 Min köcheln.' },
  { name: 'Herzhafte Pfannkuchen', tags: ['ausgewogen','ohne Gemüse'], ingredients: [
    {name:'Mehl', amount:'200', unit:'g'}, {name:'Milch', amount:'300', unit:'ml'},
    {name:'Eier', amount:'2', unit:''}, {name:'Schinken', amount:'100', unit:'g'},
    {name:'Käse gerieben', amount:'80', unit:'g'}
  ], notes: 'Teig anrühren, dünn ausbacken, mit Schinken und Käse füllen.' },
  { name: 'Thunfischsalat', tags: ['proteinreich','fettarm','mit Gemüse'], ingredients: [
    {name:'Thunfisch', amount:'1', unit:'Dose'}, {name:'Tomaten', amount:'2', unit:''},
    {name:'rote Zwiebel', amount:'1', unit:''}, {name:'Mais', amount:'1', unit:'Dose'},
    {name:'Olivenöl', amount:'1', unit:'EL'}
  ], notes: 'Alle Zutaten würfeln bzw. abtropfen lassen und vermengen.' },
  { name: 'Shakshuka', tags: ['proteinreich','mit Gemüse'], ingredients: [
    {name:'Eier', amount:'4', unit:''}, {name:'Tomaten stückig', amount:'400', unit:'g'},
    {name:'Paprika', amount:'1', unit:''}, {name:'Zwiebel', amount:'1', unit:''},
    {name:'Kreuzkümmel', amount:'1', unit:'TL'}
  ], notes: 'Gemüse anbraten, Tomaten dazu, Mulden formen, Eier hineingeben und stocken lassen.' },
  { name: 'Gebratener Reis mit Ei und Gemüse', tags: ['ausgewogen','mit Gemüse'], ingredients: [
    {name:'Reis gekocht', amount:'400', unit:'g'}, {name:'Eier', amount:'2', unit:''},
    {name:'Erbsen', amount:'100', unit:'g'}, {name:'Karotte', amount:'1', unit:''},
    {name:'Sojasauce', amount:'2', unit:'EL'}
  ], notes: 'Reis vom Vortag scharf anbraten, Gemüse und Ei unterheben, mit Sojasauce würzen.' },
  { name: 'Falafel mit Salat', tags: ['vegan','proteinreich','mit Gemüse'], ingredients: [
    {name:'Kichererbsen', amount:'1', unit:'Dose'}, {name:'Petersilie', amount:'1', unit:'Bund'},
    {name:'Knoblauch', amount:'2', unit:'Zehen'}, {name:'Salat', amount:'1', unit:'Kopf'},
    {name:'Joghurt', amount:'150', unit:'g'}
  ], notes: 'Kichererbsen mit Kräutern und Knoblauch pürieren, Bällchen formen und braten.' }
];

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
let photoFile = null, photoPreviewUrl = '';
let voiceListening = false, voiceError = '';
let recognition = null;
let householdCode = localStorage.getItem(HOUSEHOLD_LS_KEY) || '';
const receivedKeys = new Set();

// Feature-Erkennung: Spracherkennung (Web Speech API) und Datei-Teilen (Web Share API).
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceSupported = !!SpeechRec;
function shareFilesSupported(){
  return !!(navigator.canShare && navigator.share && photoFile && navigator.canShare({ files: [photoFile] }));
}

function uid(){ return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
    ensureSeedRecipes();
  }
  lastSync = new Date();
  scheduleRender();
}

function onStoreStatus(msg){
  statusMsg = msg;
  scheduleRender();
}

// Starter-Rezepte nur ein einziges Mal pro Haushalt einspielen; bestehende Daten
// werden nie überschrieben (Datensicherheits-Prinzip).
async function ensureSeedRecipes(){
  if(meta && meta.seededV1) return;
  if(recipes.length === 0){
    recipes = await mutateShared('recipes', [], (list) => {
      if(list.length === 0){
        return STARTER_RECIPES.map(r => ({ id: uid(), name:r.name, tags:r.tags, ingredients:r.ingredients, notes:r.notes }));
      }
      return list;
    });
  }
  meta = await mutateShared('meta', meta || {}, (m) => { m = m || {}; m.seededV1 = true; return m; });
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

function availabilityBadge(recipe){
  const total = recipe.ingredients.length;
  if(total === 0) return {cls:'partial', text:'keine Zutaten hinterlegt'};
  const missing = missingIngredients(recipe).length;
  const have = total - missing;
  if(missing === 0) return {cls:'full', text: 'alles da'};
  if(have === 0) return {cls:'none', text: have + ' von ' + total + ' vorrätig'};
  return {cls:'partial', text: have + ' von ' + total + ' vorrätig'};
}

function parseIngredientLine(line){
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if(tokens.length === 0) return null;
  const first = tokens[0].replace(',', '.');
  if(/^[\d.\/]+$/.test(first)){
    const second = (tokens[1] || '').toLowerCase().replace(/[.,]$/,'');
    if(tokens.length > 2 && KNOWN_UNITS.includes(second)){
      return { name: tokens.slice(2).join(' '), amount: tokens[0], unit: tokens[1] };
    }
    return { name: tokens.slice(1).join(' '), amount: tokens[0], unit: '' };
  }
  return { name: line.trim(), amount: '', unit: '' };
}

function itemCategory(item){
  return (item.category && CATEGORIES.includes(item.category)) ? item.category : 'Sonstiges';
}

function openShoppingCount(){
  return shopping.filter(s => !s.checked).length;
}

// ---------- KI-Workflow (Copy-Paste über die Claude-App) ----------

function buildAiPrompt(){
  const invText = inventory.length
    ? inventory.map(i => '- ' + i.name + (i.amount ? ' (' + i.amount + (i.unit ? ' ' + i.unit : '') + ')' : '') + ', Lagerort: ' + i.location).join('\n')
    : '- (aktuell ist nichts eingetragen)';
  const tagText = recipeFilterTags.length ? recipeFilterTags.join(', ') : 'keine besonderen Vorgaben';
  return 'Du bist ein Kochassistent für eine deutschsprachige Küche.\n\n' +
    'Unser aktueller Küchenvorrat:\n' + invText + '\n\n' +
    'Gewünschte Eigenschaften der Gerichte: ' + tagText + '.\n\n' +
    'Schlage 3 unterschiedliche, alltagstaugliche Gerichte vor. Jedes Gericht soll überwiegend aus den vorhandenen Zutaten bestehen; ein bis zwei zusätzliche Grundzutaten (Gewürze, Öl, Salz) sind erlaubt.\n\n' +
    'Antworte AUSSCHLIESSLICH mit einem JSON-Array in exakt diesem Format, ohne Markdown-Codeblock und ohne Text davor oder danach:\n' +
    '[{"name": "Gerichtname", "tags": ["nur Werte aus dieser Liste: ' + TAGS.join(', ') + '"], "ingredients": [{"name": "Zutat", "amount": "200", "unit": "g"}], "notes": "Zubereitung in maximal 3 Sätzen"}]';
}

// ---------- Foto-Erfassung (Copy-Paste über die Claude-App) ----------

function buildPhotoPrompt(){
  return 'Du hilfst beim Erfassen eines Lebensmitteleinkaufs für eine deutschsprachige Küchenvorrat-App.\n\n' +
    'Auf dem Foto, das ich dir in dieser Nachricht anhänge, sind eingekaufte Lebensmittel zu sehen. ' +
    'Erkenne alle eindeutig sichtbaren Produkte. Fasse mehrere gleiche Produkte zu einem Eintrag mit passender Menge zusammen. ' +
    'Rate nichts, was du nicht erkennen kannst.\n\n' +
    'Gib für jedes Produkt an:\n' +
    '- name: kurze deutsche Bezeichnung (z. B. "Vollmilch", "Hähnchenbrust", "Tiefkühl-Erbsen")\n' +
    '- amount: Anzahl oder Menge falls erkennbar, sonst "1"\n' +
    '- unit: Einheit falls erkennbar (g, kg, ml, l, Stück, Packung, Dose), sonst ""\n' +
    '- location: typischer Lagerort, GENAU einer aus dieser Liste: ' + LOCATIONS.join(', ') + '\n' +
    '- category: GENAU eine aus dieser Liste: ' + CATEGORIES.join(', ') + '\n\n' +
    'Ordne den Lagerort nach üblicher Aufbewahrung zu: Tiefkühlware in die Gefriertruhe; ' +
    'Frischware, Fleisch, Fisch und Milchprodukte in den Kühlschrank; haltbare Ware, Konserven und Trockenware in den Vorratsschrank.\n\n' +
    'Antworte AUSSCHLIESSLICH mit einem JSON-Array in exakt diesem Format, ohne Markdown-Codeblock und ohne Text davor oder danach:\n' +
    '[{"name": "Vollmilch", "amount": "1", "unit": "l", "location": "Kühlschrank", "category": "Milchprodukte"}]';
}

function parsePhotoItems(raw){
  const clean = raw.replace(/```json|```/g, '').trim();
  let jsonText = clean;
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if(start >= 0 && end > start){
    jsonText = clean.slice(start, end + 1);
  } else {
    const os = clean.indexOf('{'); const oe = clean.lastIndexOf('}');
    if(os >= 0 && oe > os) jsonText = '[' + clean.slice(os, oe + 1) + ']';
  }
  const parsed = JSON.parse(jsonText);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const result = arr
    .filter(r => r && typeof r.name === 'string' && r.name.trim())
    .map(r => ({
      id: uid(),
      name: String(r.name).trim(),
      amount: String(r.amount || '1').trim() || '1',
      unit: String(r.unit || '').trim(),
      location: LOCATIONS.includes(r.location) ? r.location : 'Vorratsschrank',
      category: CATEGORIES.includes(r.category) ? r.category : 'Sonstiges'
    }));
  if(result.length === 0) throw new Error('keine Produkte erkannt');
  return result;
}

function parseAiRecipes(raw){
  const clean = raw.replace(/```json|```/g, '').trim();
  let jsonText = clean;
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if(start >= 0 && end > start){
    jsonText = clean.slice(start, end + 1);
  } else {
    const os = clean.indexOf('{'); const oe = clean.lastIndexOf('}');
    if(os >= 0 && oe > os) jsonText = '[' + clean.slice(os, oe + 1) + ']';
  }
  const parsed = JSON.parse(jsonText);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const result = arr
    .filter(r => r && typeof r.name === 'string' && r.name.trim())
    .map(r => ({
      name: r.name.trim(),
      tags: (Array.isArray(r.tags) ? r.tags : []).filter(t => TAGS.includes(t)),
      ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).map(i => ({
        name: String(i.name || '').trim(), amount: String(i.amount || ''), unit: String(i.unit || '')
      })).filter(i => i.name),
      notes: String(r.notes || '')
    }));
  if(result.length === 0) throw new Error('keine Rezepte erkannt');
  return result;
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

function renderVorrat(){
  const blocks = LOCATIONS.map(loc => {
    const items = inventory.filter(i => i.location === loc);
    let inner;
    if(items.length){
      const groups = CATEGORIES.filter(cat => items.some(i => itemCategory(i) === cat));
      inner = groups.map(cat => {
        const collapsed = collapsedCats.has(loc + '|' + cat);
        const catItems = items.filter(i => itemCategory(i) === cat);
        const rows = collapsed ? '' : catItems.map(i => `
          <div class="item-row" data-item-id="${i.id}">
            <span class="item-name">${escapeHtml(i.name)}</span>
            <span class="item-qty">${escapeHtml(String(i.amount))}${i.unit ? ' '+escapeHtml(i.unit) : ''}</span>
            <span class="item-actions">
              <button data-action="dec-item" title="weniger">−</button>
              <button data-action="inc-item" title="mehr">+</button>
              <button data-action="del-item" title="entfernen">×</button>
            </span>
          </div>
        `).join('');
        return `
          <div class="cat-head" data-action="toggle-cat" data-loc="${loc}" data-cat="${escapeHtml(cat)}">
            <span>${escapeHtml(cat)} (${catItems.length})</span><span class="cat-toggle">${collapsed ? '▸' : '▾'}</span>
          </div>
          ${rows}
        `;
      }).join('');
    } else {
      inner = '<div class="empty-note">Noch nichts eingetragen.</div>';
    }

    return `
      <div class="loc-block">
        <span class="loc-label">${loc}</span>
        ${inner}
        <div class="add-row">
          <input type="text" placeholder="Artikel" class="new-item-name" data-loc="${loc}">
          <input type="number" placeholder="Menge" class="qty-input new-item-qty" data-loc="${loc}" value="1" min="0">
          <input type="text" placeholder="Einheit" class="unit-input new-item-unit" data-loc="${loc}">
          <select class="new-item-cat" data-loc="${loc}">
            ${CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
          <button class="btn small" data-action="add-item" data-loc="${loc}">Hinzufügen</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="card">
      <h2>Einkauf schnell erfassen</h2>
      <div class="status-line" style="margin-bottom:8px;">Eine Zeile pro Artikel, z. B. „2 kg Kartoffeln" oder einfach „Milch". Per Sprache diktieren oder einfach tippen.</div>
      <div class="capture-row">
        <button class="btn small ${voiceListening ? 'secondary' : ''}" data-action="toggle-voice">${voiceListening ? '■ Aufnahme stoppen' : '🎤 Einkauf sprechen'}</button>
        <span class="voice-interim ${voiceListening ? 'live' : ''}" id="voice-interim">${voiceListening ? 'Höre zu … sprich z. B. „zwei Kilo Kartoffeln, drei Dosen Kichererbsen, Milch"' : ''}</span>
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
    <div class="card"><h2>Was wir gerade da haben</h2><div class="loc-grid">${blocks}</div></div>
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
        <div class="paste-hint">Schnell einfügen: erste Zeile der Name des Gerichts, jede weitere Zeile eine Zutat (z. B. „200 g Linsen" oder einfach „Zwiebel"). Danach unten Tags wählen und speichern.</div>
        <textarea id="paste-area" rows="4" placeholder="Linsensuppe&#10;200 g rote Linsen&#10;2 Karotten&#10;1 Zwiebel"></textarea>
        <div style="margin-top:8px;"><button class="btn small secondary" data-action="parse-paste">In Formular übernehmen</button></div>
      </div>
      ${renderNewRecipeForm()}
    </div>
  `;
}

function renderAiBox(){
  let suggestionsHtml = '';
  if(aiSuggestions && aiSuggestions.length){
    suggestionsHtml = aiSuggestions.map((s, idx) => {
      const missing = s.ingredients.filter(i => !ingredientAvailable(i.name)).map(i => i.name);
      const ingHtml = s.ingredients.map(i => {
        const miss = missing.includes(i.name);
        return `<li class="${miss?'miss':'have'}">${escapeHtml(i.name)}${i.amount?` (${escapeHtml(String(i.amount))}${i.unit?' '+escapeHtml(i.unit):''})`:''}</li>`;
      }).join('');
      const tagsHtml = s.tags.map(t=>`<span class="recipe-tag">${escapeHtml(t)}</span>`).join('');
      return `
        <div class="ai-suggestion">
          <p class="recipe-title">${escapeHtml(s.name)}</p>
          <div class="recipe-tags">${tagsHtml}</div>
          <ul class="ing-list">${ingHtml}</ul>
          ${s.notes ? `<div class="recipe-notes">${escapeHtml(s.notes)}</div>` : ''}
          <div class="recipe-controls">
            <button class="btn small" data-action="save-ai-suggestion" data-idx="${idx}">In Rezeptliste übernehmen</button>
          </div>
        </div>
      `;
    }).join('') + `
      <div class="recipe-controls" style="margin-top:10px;">
        <button class="btn small secondary" data-action="discard-ai-suggestions">Vorschläge verwerfen</button>
      </div>
    `;
  }
  return `
    <div class="ai-box">
      <div class="status-line" style="margin-bottom:8px;">So geht's: 1) Prompt kopieren. 2) In der Claude-App einfügen und abschicken. 3) Claudes komplette Antwort kopieren und unten einfügen. Der Prompt enthält euren aktuellen Vorrat und die oben gewählten Tag-Filter.</div>
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

  return `
    <div class="recipe-card" data-recipe-id="${r.id}">
      <div class="recipe-top">
        <p class="recipe-title">${escapeHtml(r.name)}</p>
        <span class="avail-badge ${badge.cls}">${badge.text}</span>
      </div>
      <div class="recipe-tags">${tagsHtml}</div>
      <ul class="ing-list">${ingItems}</ul>
      ${r.notes ? `<div class="recipe-notes">${escapeHtml(r.notes)}</div>` : ''}
      <div class="recipe-controls">
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
      <textarea id="new-recipe-notes" placeholder="Notizen (optional)" rows="2">${escapeHtml(draftNotes)}</textarea>
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
  const newItem = { id: uid(), name, amount: qtyInput.value || '1', unit: unitInput.value.trim(), location: loc, category: catInput.value };
  inventory = await mutateShared('inventory', inventory, (inv) => { inv.push(newItem); return inv; });
  render();
}

async function bulkAdd(){
  const ta = document.getElementById('bulk-add-text');
  const loc = document.getElementById('bulk-add-loc').value;
  const cat = document.getElementById('bulk-add-cat').value;
  const lines = (ta ? ta.value : bulkDraft).split('\n').map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return;
  const newItems = lines.map(parseIngredientLine).filter(Boolean).map(p => ({
    id: uid(), name: p.name, amount: p.amount || '1', unit: p.unit || '', location: loc, category: cat
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
    let n = parseFloat(String(item.amount).replace(',','.')) || 0;
    n += action === 'inc-item' ? 1 : -1;
    if(n <= 0) return inv.filter(i => i.id !== id);
    item.amount = n;
    return inv;
  });
  render();
}

async function saveRecipe(){
  const nameEl = document.getElementById('new-recipe-name');
  const name = nameEl.value.trim();
  if(!name){ nameEl.focus(); return; }
  const ingredients = draftIngredients.filter(i => i.name.trim());
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
  const unit = document.getElementById('new-shop-unit').value.trim();
  const it = { id: uid(), name, amount, unit, checked: false, source: 'manuell' };
  shopping = await mutateShared('shopping', shopping, (list) => { list.push(it); return list; });
  render();
}

async function shopToInventory(){
  const doneItems = shopping.filter(s => s.checked && s.name && s.name.trim());
  if(!doneItems.length) return;
  inventory = await mutateShared('inventory', inventory, (inv) => {
    doneItems.forEach(it => {
      const existing = inv.find(x => x.name.trim().toLowerCase() === it.name.trim().toLowerCase());
      if(existing){
        const a = parseFloat(String(existing.amount).replace(',','.')) || 0;
        const b = parseFloat(String(it.amount).replace(',','.')) || 0;
        if(a && b){ existing.amount = a + b; }
      } else {
        inv.push({ id: uid(), name: it.name.trim(), amount: it.amount || '1', unit: it.unit || '', location: 'Vorratsschrank', category: 'Sonstiges' });
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
  const ok = await copyToClipboard(buildAiPrompt());
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

const NUM_WORDS = { 'ein':'1','eine':'1','einen':'1','eins':'1','zwei':'2','drei':'3','vier':'4','fünf':'5','sechs':'6','sieben':'7','acht':'8','neun':'9','zehn':'10','elf':'11','zwölf':'12' };
const UNIT_WORDS = { 'kilo':'kg','kilos':'kg','kilogramm':'kg','gramm':'g','liter':'l','milliliter':'ml','dose':'Dose','dosen':'Dosen','packung':'Packung','packungen':'Packungen','stück':'Stück','stücke':'Stück','flasche':'Flasche','flaschen':'Flaschen','becher':'Becher','glas':'Glas','gläser':'Gläser','bund':'Bund','tüte':'Tüte','tüten':'Tüten' };

function normalizeSpokenLine(line){
  const words = line.trim().split(/\s+/).filter(Boolean).map((w, i) => {
    const lw = w.toLowerCase().replace(/[.,;:!?]+$/,'');
    if(i === 0 && NUM_WORDS[lw]) return NUM_WORDS[lw];
    if(UNIT_WORDS[lw]) return UNIT_WORDS[lw];
    return w;
  });
  return words.join(' ').trim();
}

function spokenToLines(text){
  return text.split(/\s*,\s*|\s+und\s+/i).map(s => s.trim()).filter(Boolean).map(normalizeSpokenLine).filter(Boolean);
}

function commitVoice(){
  const finalText = (recognition && recognition._finalText || '').trim();
  if(finalText){
    const lines = spokenToLines(finalText);
    if(lines.length){
      bulkDraft = (bulkDraft.trim() ? bulkDraft.replace(/\s*$/,'') + '\n' : '') + lines.join('\n');
    }
  }
  recognition = null;
}

function startVoice(){
  voiceError = '';
  if(!voiceSupported){
    voiceError = 'Live-Spracherkennung wird auf diesem Gerät nicht unterstützt. Tipp: das Mikrofon-Symbol der Handy-Tastatur zum Diktieren ins Textfeld nutzen.';
    render();
    return;
  }
  try{
    recognition = new SpeechRec();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition._finalText = '';
    recognition.onresult = (ev) => {
      let interim = '';
      for(let i = ev.resultIndex; i < ev.results.length; i++){
        const res = ev.results[i];
        if(res.isFinal) recognition._finalText += res[0].transcript + ' ';
        else interim += res[0].transcript;
      }
      const el = document.getElementById('voice-interim');
      if(el) el.textContent = (recognition._finalText + interim).trim() || 'Höre zu …';
    };
    recognition.onerror = (ev) => {
      voiceError = ev.error === 'not-allowed'
        ? 'Mikrofon-Zugriff wurde nicht erlaubt. Bitte in den Browser-/App-Einstellungen freigeben.'
        : 'Spracherkennung abgebrochen. Bitte erneut versuchen.';
    };
    recognition.onend = () => { voiceListening = false; commitVoice(); render(); };
    recognition.start();
    voiceListening = true;
    render();
  }catch(e){
    console.error(e);
    voiceError = 'Spracherkennung konnte nicht gestartet werden.';
    voiceListening = false;
    recognition = null;
    render();
  }
}

function stopVoice(){
  if(recognition){ try{ recognition.stop(); }catch(e){ /* onend übernimmt */ } }
  else { voiceListening = false; render(); }
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
      case 'add-item': await addItem(el.dataset.loc); break;
      case 'bulk-add': await bulkAdd(); break;
      case 'inc-item': case 'dec-item': case 'del-item': {
        const rowEl = el.closest('.item-row');
        if(rowEl) await changeItem(rowEl.dataset.itemId, action);
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
        draftName = lines[0];
        draftIngredients = lines.slice(1).map(parseIngredientLine).filter(Boolean);
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
        const newRecipe = { id: uid(), name: s.name, tags: s.tags, ingredients: s.ingredients, notes: s.notes };
        recipes = await mutateShared('recipes', recipes, (list) => { list.push(newRecipe); return list; });
        aiSuggestions = aiSuggestions.filter((_, i) => i !== parseInt(el.dataset.idx));
        if(aiSuggestions.length === 0) aiSuggestions = null;
        statusMsg = '„' + s.name + '" wurde in die Rezeptliste übernommen.';
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
    ensureSeedRecipes();
    render();
  }
}

bindGlobalEvents();
boot();
