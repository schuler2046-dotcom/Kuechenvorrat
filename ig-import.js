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

// Entscheidet, welche Einträge neu sind: gleiche igId, gleiche id oder (ohne igId) gleicher Name gelten als vorhanden.
export function pickNew(existing, incoming){
  const ids = new Set(existing.map(r => r.id));
  const igIds = new Set(existing.filter(r => r.igId).map(r => r.igId));
  const names = new Set(existing.map(r => String(r.name || '').trim().toLowerCase()));
  const add = [];
  let skipped = 0;
  for(const item of incoming){
    const r = item.recipe;
    const dup = (r.igId && igIds.has(r.igId)) || (r.id && ids.has(r.id)) || (!r.igId && names.has(r.name.toLowerCase()));
    if(dup){ skipped++; continue; }
    if(r.id) ids.add(r.id);
    if(r.igId) igIds.add(r.igId);
    names.add(r.name.toLowerCase());
    add.push(item);
  }
  return { add, skipped };
}
