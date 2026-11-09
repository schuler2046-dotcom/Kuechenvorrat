// Einkaufsbedarf aus Rezept-Bewertungen ableiten – reine Funktionen ohne DOM.

import { parseAmount, unitInfo, isItemUnit, metricParts, partsFromBase, addAmounts } from './units.js';
import { normKey } from './matching.js';

// Einkaufseintrag {name, amount, unit} für eine fehlende oder knappe Zutat.
// Knappe Zutaten mit bekannter Packungsgröße werden in ganzen Packungen eingekauft.
export function needFor(row, factor = 1){
  const name = row.ing.name;
  if(row.status === 'knapp'){
    const item = (row.items || []).find(i => isItemUnit(i.unit) && parseAmount(i.packSize));
    if(item){
      const pi = unitInfo(item.packUnit || 'g');
      const per = parseAmount(item.packSize) * (pi ? pi.factor : 1);
      if(pi && pi.dim === row.dim && per > 0){
        return { name, amount: String(Math.max(1, Math.ceil(row.short / per - 1e-9))), unit: item.unit };
      }
    }
    const p = partsFromBase(row.dim, row.short);
    return { name, amount: String(p.amount), unit: p.unit };
  }
  const n = parseAmount(row.ing.amount);
  if(n === null) return { name, amount: '', unit: '' };
  const p = metricParts(n * factor, row.ing.unit);
  return { name, amount: String(p.amount), unit: p.unit };
}

// Fasst gleiche Zutaten aus mehreren Rezepten zusammen. Mengen werden nur addiert, wenn die
// Einheiten zusammenpassen; sonst bleibt es bei getrennten Einträgen.
export function mergeNeeds(list){
  const out = [];
  for(const nd of list){
    const key = normKey(nd.name);
    const same = out.find(o => normKey(o.name) === key);
    if(!same){ out.push({ ...nd }); continue; }
    if(nd.amount === '') continue;
    if(same.amount === ''){ same.amount = nd.amount; same.unit = nd.unit; continue; }
    const sum = addAmounts(same.amount, same.unit, nd.amount, nd.unit);
    if(sum){ same.amount = String(sum.amount); same.unit = sum.unit; }
    else out.push({ ...nd });
  }
  return out;
}

// Bedarf eines bewerteten Rezepts (ev aus evaluateRecipe): alles, was fehlt oder knapp ist.
export function needsOfEvaluation(ev, factor = 1){
  return [...ev.missing, ...ev.short].map(row => needFor(row, factor));
}

// Gleicht die automatisch aus dem Wochenplan abgeleiteten Einträge (source 'plan') mit dem aktuellen
// Bedarf ab. Nur offene Plan-Einträge werden angelegt, angepasst oder entfernt. Eigene Einträge
// (manuell, rezept) und abgehakte bleiben unberührt; ist ein Plan-Eintrag schon abgehakt, wird er nicht
// noch einmal angelegt. newId erzeugt die ID für neue Einträge.
export function reconcilePlanNeeds(list, needs, newId){
  // Ein Bedarf kann dieselbe Zutat in zwei Einheiten haben (200 g Mehl + 1 Packung): Schlüssel = Name + Einheit.
  const kn = (name, unit) => normKey(name) + '|' + (unit || '');
  const wanted = new Map(needs.map(n => [kn(n.name, n.unit), n]));
  const ownOpen = new Set(list.filter(s => !s.checked && s.source !== 'plan').map(s => normKey(s.name)));
  const bought = new Set(list.filter(s => s.checked && s.source === 'plan').map(s => normKey(s.name)));
  const seen = new Set();
  const out = [];
  let changed = false;
  for(const s of list){
    if(s.checked || s.source !== 'plan'){ out.push(s); continue; }
    const k = kn(s.name, s.unit);
    const nd = wanted.get(k);
    if(!nd || ownOpen.has(normKey(s.name)) || seen.has(k)){ changed = true; continue; }
    seen.add(k);
    if(String(s.amount ?? '') !== nd.amount){
      out.push({ ...s, amount: nd.amount });
      changed = true;
    } else out.push(s);
  }
  for(const [k, nd] of wanted){
    const name = normKey(nd.name);
    if(seen.has(k) || ownOpen.has(name) || bought.has(name)) continue;
    out.push({ id: newId(), name: nd.name, amount: nd.amount, unit: nd.unit, checked: false, source: 'plan' });
    changed = true;
  }
  return { list: out, changed };
}
