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
