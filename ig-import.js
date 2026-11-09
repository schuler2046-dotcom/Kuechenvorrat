// Import von Instagram-Rezepten aus der Sync-Datei – reine Funktionen ohne DOM.
//
// Die Datei kommt aus der Instagram-Sync-Werkstatt:
//   { "app": "kuechenvorrat-instagram", "version": 1, "recipes": [ { igId, title|name, ingredients, steps,
//     category, servings, time|zeit, sourceUrl, author, status, imageData (Data-URL), ... } ] }
// Der Import ist rein additiv: bestehende Rezepte werden nie verändert.

import { canonicalUnit, parseAmount } from './units.js';

export function parseImportFile(text){
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data.recipes;
  if(!Array.isArray(list)) throw new Error('keine Rezeptliste gefunden');
  return list;
}

// Wandelt einen Eintrag der Sync-Datei in ein Vorratsapp-Rezept um.
// Rückgabe: { recipe, imageData } oder null, wenn kein Name vorhanden ist.
export function normalizeIgRecipe(raw, now = new Date().toISOString()){
  const name = String(raw.name || raw.title || '').trim();
  if(!name) return null;
  const igId = String(raw.igId || raw.id || '').trim();

  const ingredients = (raw.ingredients || []).map(i => {
    const n = parseAmount(i.amount);
    const out = {
      name: String(i.name || '').trim(),
      amount: n === null ? '' : String(n),
      unit: canonicalUnit(i.unit || '')
    };
    if(i.note && String(i.note).trim()) out.note = String(i.note).trim();
    if(i.approx) out.approx = true;
    return out;
  }).filter(i => i.name);

  const steps = (raw.steps || []).map(s => String(s || '').trim()).filter(Boolean);
  const status = ['ok', 'pruefen', 'unvollstaendig'].includes(raw.status)
    ? raw.status
    : (ingredients.length && steps.length ? 'ok' : 'unvollstaendig');
  const servings = parseAmount(raw.servings);
  const zeit = String(raw.zeit || raw.time || '').trim();

  const recipe = {
    id: igId ? 'ig-' + igId : undefined,
    igId: igId || undefined,
    source: 'instagram',
    name,
    category: raw.category || undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter(Boolean) : [],
    servings: servings && servings > 0 ? Math.round(servings) : undefined,
    zeit: zeit || undefined,
    sourceUrl: raw.sourceUrl || undefined,
    author: raw.author || undefined,
    ingredients,
    steps,
    notes: raw.notes ? String(raw.notes) : undefined,
    nutrition: raw.nutrition ? String(raw.nutrition) : undefined,
    status,
    hasImage: !!raw.imageData,
    importedAt: now
  };
  return { recipe, imageData: raw.imageData || null };
}

// Name für den Vergleich: klein, Leerzeichen zusammengefasst.
const nameKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Entscheidet, welche Einträge neu sind: gleiche igId, gleiche id oder gleicher Name gelten als
// vorhanden, auch innerhalb der Datei selbst. So entstehen keine Doppelungen.
export function pickNew(existing, incoming){
  const ids = new Set(existing.map(r => r.id));
  const igIds = new Set(existing.filter(r => r.igId).map(r => r.igId));
  const names = new Set(existing.map(r => nameKey(r.name)));
  const add = [];
  let skipped = 0;
  for(const item of incoming){
    const r = item.recipe;
    const dup = (r.igId && igIds.has(r.igId)) || (r.id && ids.has(r.id)) || names.has(nameKey(r.name));
    if(dup){ skipped++; continue; }
    if(r.id) ids.add(r.id);
    if(r.igId) igIds.add(r.igId);
    names.add(nameKey(r.name));
    add.push(item);
  }
  return { add, skipped };
}

// Bilder für bereits vorhandene Rezepte (gleiche igId oder id), die noch keins haben. Von Hand
// bearbeitete Rezepte (editedAt) bleiben unberührt, damit ein bewusst entferntes Bild nicht zurückkommt.
export function pickImageUpdates(existing, incoming){
  const byIg = new Map(existing.filter(r => r.igId).map(r => [r.igId, r]));
  const byId = new Map(existing.map(r => [r.id, r]));
  const seen = new Set();
  const out = [];
  for(const item of incoming){
    if(!item.imageData) continue;
    const r = item.recipe;
    const ex = (r.igId && byIg.get(r.igId)) || (r.id && byId.get(r.id));
    if(!ex || ex.hasImage || ex.editedAt || seen.has(ex.id)) continue;
    seen.add(ex.id);
    out.push({ id: ex.id, imageData: item.imageData });
  }
  return out;
}

// ---------- Import rückgängig machen ----------
// Jeder Import wird als Charge gespeichert (meta.igBatches). Rückgängig löscht nur Rezepte dieser
// Charge, die seit dem Import nicht von Hand bearbeitet wurden (editedAt gesetzt = geschützt).

export function makeBatch(recipes, at = new Date().toISOString()){
  return { id: 'batch-' + at, at, ids: recipes.map(r => r.id) };
}

// Neueste Charge, die noch nicht rückgängig gemacht wurde (Liste ist neueste zuerst).
export function nextBatch(batches){
  return (batches || []).find(b => !b.used) || null;
}

// Was passiert beim Rückgängig? remove = wird gelöscht, edited = bearbeitet (bleibt),
// gone = existiert nicht mehr. Nur Instagram-Rezepte werden je gelöscht.
export function planUndo(batch, recipes){
  const byId = new Map(recipes.map(r => [r.id, r]));
  const plan = { remove: [], edited: [], gone: [] };
  for(const id of batch.ids){
    const r = byId.get(id);
    if(!r) plan.gone.push(id);
    else if(r.source !== 'instagram' || r.editedAt) plan.edited.push(id);
    else plan.remove.push(id);
  }
  return plan;
}

export function applyUndo(recipes, plan){
  const rm = new Set(plan.remove);
  return recipes.filter(r => !rm.has(r.id));
}

// Liste der Chargen nach dem Rückgängig: die Charge bleibt stehen, ist aber verbraucht.
export function markUsed(batches, id, at = new Date().toISOString()){
  return (batches || []).map(b => b.id === id ? { ...b, used: true, usedAt: at } : b);
}
