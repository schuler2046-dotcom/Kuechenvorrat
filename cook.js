// "Gekocht": berechnet, was beim Kochen eines Rezepts aus dem Vorrat abgebucht wird.
// Reine Funktionen ohne DOM. Die Abbuchung selbst läuft in app.js als Transaktion.

import { evaluateIngredient, isLoose } from './matching.js';
import { qty, parseAmount, stockIn, reduceAmount } from './units.js';

const EPS = 1e-6;

// Ein Eintrag je Zutat. kind:
//   deduct        – wird abgebucht (picks = aus welchen Artikeln wie viel)
//   staple        – Grundvorrat, wird nie abgebucht
//   missing       – nicht im Vorrat, nichts abzubuchen
//   unknown       – Rezept nennt keine Menge
//   unconvertible – Einheiten passen nicht zusammen (z. B. g gegen Dose ohne Packungsgröße)
export function planDeduction(recipe, inventory, ctx = {}, factor = 1){
  return (recipe.ingredients || []).map((ing, idx) => {
    const ev = evaluateIngredient(ing, inventory, ctx, factor);
    const base = { idx, ing, status: ev.status };
    if(ev.status === 'grundvorrat') return { ...base, kind: 'staple' };
    if(ev.status === 'fehlt') return { ...base, kind: 'missing' };

    const n = parseAmount(ing.amount);
    const q = n === null ? null : qty(n * factor, ing.unit);
    if(!q) return { ...base, kind: 'unknown', items: ev.items };

    let remaining = q.value;
    let convertible = 0;
    const picks = [];
    for(const item of ev.items){
      const stock = stockIn(item, q.dim);
      if(stock === null) continue;
      convertible++;
      if(remaining <= EPS) continue;
      const take = Math.min(stock, remaining);
      if(take <= EPS) continue;
      picks.push({
        id: item.id, name: item.name, location: item.location,
        take, dim: q.dim,
        before: { amount: item.amount, unit: item.unit },
        after: reduceAmount(item, take, q.dim)
      });
      remaining -= take;
    }
    if(!convertible) return { ...base, kind: 'unconvertible', need: q, items: ev.items };
    return {
      ...base, kind: 'deduct', need: q, picks,
      short: remaining > EPS ? remaining : 0,
      loose: isLoose(ing, q, ev.items),
      substitute: ev.substitute
    };
  });
}

// Standardmäßig angehakt: echte Abbuchungen, aber keine Gewürze/Kleinmengen und nichts, was gar nicht da war.
export function defaultOn(row){
  return row.kind === 'deduct' && !row.loose && row.picks.length > 0;
}

// Wendet die gewählten Abbuchungen auf eine Kopie des Vorrats an. Nie unter 0, Artikel ohne
// Rest werden entfernt. undo enthält den Zustand der veränderten Artikel vor der Abbuchung.
export function applyDeduction(inventory, picks){
  const inv = inventory.map(i => ({ ...i }));
  const undo = new Map();
  for(const p of picks){
    const item = inv.find(i => i.id === p.id);
    if(!item) continue;
    const next = reduceAmount(item, p.take, p.dim);
    if(next === null) continue;
    if(!undo.has(p.id)) undo.set(p.id, { ...item });
    item.amount = next;
  }
  const result = inv.filter(i => !(undo.has(i.id) && (parseAmount(i.amount) ?? 1) <= 0.0001));
  return { inventory: result, undo: [...undo.values()] };
}

// Macht eine Abbuchung rückgängig: stellt Mengen wieder her, legt entfernte Artikel neu an.
export function revertDeduction(inventory, snapshots){
  const inv = inventory.map(i => ({ ...i }));
  for(const snap of snapshots){
    const cur = inv.find(i => i.id === snap.id);
    if(cur){ cur.amount = snap.amount; cur.unit = snap.unit; }
    else inv.push({ ...snap });
  }
  return inv;
}
