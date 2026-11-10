// Reine Logik des Werkzeugs tools/vorrat.mjs (kein Netz, kein Dateizugriff) – dadurch testbar.

import { normalizeIgRecipe, pickNew, pickImageUpdates } from '../ig-import.js';

// Rohrezepte (Instagram-Format) in Vorratsapp-Rezepte umwandeln. Einträge ohne Namen fallen weg.
export function normalizeAll(rawList, imageData = null, now){
  return rawList
    .map(raw => normalizeIgRecipe(imageData && rawList.length === 1 ? { ...raw, imageData } : raw, now))
    .filter(Boolean);
}

// Neue Rezepte an die Liste hängen (additiv, wie der frühere Import in der App).
// Rückgabe: neue Rezeptliste, zu schreibende Bilder, neue Rezepte, Zählung.
export function addRecipes(recipes, items){
  const { add, skipped } = pickNew(recipes, items);
  const imgUpd = pickImageUpdates(recipes, items);
  const added = add.map(a => a.recipe);
  const images = [
    ...add.filter(a => a.imageData).map(a => ({ id: a.recipe.id, imageData: a.imageData })),
    ...imgUpd
  ];
  const nextRecipes = [
    ...recipes.map(r => imgUpd.find(u => u.id === r.id) ? { ...r, hasImage: true } : r),
    ...added
  ];
  return { recipes: nextRecipes, images, added, skipped, imagesAdded: imgUpd.length };
}

// Felder eines Rezepts ändern. Setzt editedAt, damit Import und Rückgängig es nicht mehr anfassen.
export function patchRecipe(recipes, id, patch, now = new Date().toISOString()){
  if(!recipes.some(r => r.id === id)) throw new Error('Rezept nicht gefunden: ' + id);
  const forbidden = ['id'];
  for(const k of forbidden) if(k in patch) throw new Error('Feld darf nicht geändert werden: ' + k);
  return recipes.map(r => r.id === id ? { ...r, ...patch, editedAt: now } : r);
}

export function removeRecipe(recipes, id){
  if(!recipes.some(r => r.id === id)) throw new Error('Rezept nicht gefunden: ' + id);
  return recipes.filter(r => r.id !== id);
}

export function findRecipes(recipes, query){
  const q = String(query || '').trim().toLowerCase();
  if(!q) return [];
  return recipes.filter(r => r.id === query || String(r.name || '').toLowerCase().includes(q));
}

// ---------- Warteliste (Dokument "inbox") ----------

export function openInbox(inbox){
  return (inbox || []).filter(e => e.status === 'offen');
}

export function markInbox(inbox, id, patch){
  if(!(inbox || []).some(e => e.id === id)) throw new Error('Eintrag nicht gefunden: ' + id);
  return inbox.map(e => e.id === id ? { ...e, ...patch } : e);
}

// ---------- Sicherungen ----------

// Welche Sicherungsordner (Namen sind Zeitstempel) werden gelöscht? Die neuesten `keep` bleiben.
export function backupsToDelete(names, keep = 20){
  return [...names].sort().reverse().slice(keep);
}

export function backupName(date = new Date()){
  return date.toISOString().replace(/[:.]/g, '-');
}
