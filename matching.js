// Zutaten gegen den Vorrat abgleichen – reine Funktionen ohne DOM.
//
// Reihenfolge der Regeln:
//   1. Grundvorrat (Salz, Pfeffer, Wasser …): nie "fehlt", wird nie abgebucht.
//   2. Eigene Aliase ("Rezeptname -> Vorratsname"), die die App sich merkt.
//   3. Gehört die Rezeptzutat zu einer Zutaten-Familie (Öl, Nudeln, passierte Tomaten …),
//      zählen nur Vorratsartikel derselben Familie (Olivenöl passt auf "Öl", Rapsöl ersetzt Olivenöl).
//   4. Sonst: ganze Wörter vergleichen (Salz ≠ Salzstangen), Beiwörter wie Farbe oder
//      "gehackt" werden ignoriert (rote Zwiebel = Zwiebel).
// Danach wird die Menge geprüft: streng bei großen Mengen (Mehl, Nudeln, Reis …), locker
// bei Gewürzen und Kleinmengen.

import { qty, stockIn, parseAmount, unitInfo, formatBase } from './units.js';

export const DEFAULT_STAPLES = ['Salz', 'Pfeffer', 'Wasser'];

// Toleranz bei strengen Mengen: ab 90 % des Bedarfs gilt es als genug.
const TOLERANCE = 0.9;
// Kleinmengen unter diesem Wert (g oder ml) werden nur auf "vorhanden?" geprüft.
const LOOSE_BELOW = 30;
// Einheiten, bei denen nie streng verglichen wird.
const LOOSE_UNITS = new Set(['TL', 'EL', 'Prise', 'Msp', 'Tropfen', 'Päckchen', 'Handvoll', 'Zweig', 'Blatt', 'Bund', 'Zehe', 'Würfel']);

// ---------- Namens-Normalisierung ----------

function fold(s){
  return String(s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
}

// Sehr einfache Endungs-Entfernung, nur damit Singular und Plural gleich werden
// (Tomaten/Tomate, Zwiebeln/Zwiebel, Eier/Ei). Muss nicht sprachlich korrekt sein.
function stem(word){
  const w = fold(word);
  if(/^ei(er|ern)?$/.test(w)) return 'ei';
  for(const suf of ['ern', 'en', 'er', 'es', 'e', 'n', 's']){
    if(w.length - suf.length >= 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}

function stemSet(words){ return new Set(words.map(stem)); }

// Wörter ohne Aussage für den Abgleich (Mengen-/Mengenwörter, Füllwörter, Größen).
const NOISE = stemSet([
  'frisch', 'frische', 'bio', 'groß', 'große', 'großer', 'mittelgroß', 'mittelgroße', 'klein', 'kleine', 'reif', 'reife',
  'optional', 'etwas', 'ein', 'eine', 'einen', 'einer', 'der', 'die', 'das', 'und', 'oder', 'ca', 'je', 'zum', 'zur',
  'für', 'zu', 'aus', 'mit', 'ohne', 'nach', 'geschmack', 'fein', 'feine', 'grob', 'grobe', 'dose', 'dosen', 'packung',
  'stück', 'stücke', 'prise', 'bund', 'zehe', 'zehen', 'tl', 'el'
]);

// Beiwörter, die die Zutat nicht verändern: Farbe, Zubereitung, Kocheigenschaft.
const MODIFIERS = stemSet([
  'rot', 'rote', 'gelb', 'gelbe', 'grün', 'grüne', 'weiß', 'weiße', 'braun', 'braune', 'schwarz', 'schwarze',
  'gehackt', 'gehackte', 'gewürfelt', 'gewürfelte', 'gerieben', 'geriebene', 'gemahlen', 'gemahlene', 'geschnitten',
  'festkochend', 'festkochende', 'mehligkochend', 'mehligkochende', 'vorwiegend', 'neu', 'neue', 'jung', 'junge',
  'ganz', 'ganze', 'tk', 'tiefgekühlt', 'tiefgekühlte', 'getrocknet', 'getrocknete'
]);

function rawTokens(name){
  let s = String(name ?? '').toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.split(',')[0];
  return s.split(/[^a-zäöüß]+/).filter(Boolean);
}

// Bedeutungstragende Wörter (ohne Füllwörter und Beiwörter), gestemmt.
function coreTokens(name){
  const out = new Set();
  for(const t of rawTokens(name)){
    const s = stem(t);
    if(!NOISE.has(s) && !MODIFIERS.has(s)) out.add(s);
  }
  return out;
}

// Stabiler Schlüssel eines Namens, z. B. für gespeicherte Aliase.
export function normKey(name){
  const toks = [...coreTokens(name)].sort();
  return toks.join(' ');
}

// Klein, ohne Umlaute, ohne Klammern – Grundlage für die Familien-Muster.
function cleanFold(name){
  return fold(String(name ?? '').replace(/\([^)]*\)/g, ' ').replace(/,/g, ' ')).replace(/\s+/g, ' ').trim();
}

// ---------- Zutaten-Familien ----------
// generic: Muster für den allgemeinen Begriff. kinds: Untergruppen; Arten derselben `grp`
// ersetzen sich gegenseitig (Raps- für Olivenöl). exclude: gehört ausdrücklich nicht dazu
// (Puderzucker ist kein Zucker, Dinkelmehl ist kein Weizenmehl).
const FAMILIES = [
  { id: 'oel',
    generic: /(^| )(ol|speisol|pflanzenol)( |$)/,
    kinds: [
      { re: /olivenol/, grp: 'koch' }, { re: /rapsol/, grp: 'koch' }, { re: /sonnenblumenol/, grp: 'koch' },
      { re: /erdnussol/, grp: 'koch' }, { re: /kokosol|kokosfett/ }, { re: /sesamol/ }, { re: /walnussol/ }, { re: /leinol/ }
    ] },
  { id: 'pasta',
    generic: /(^| )(nudel|nudeln|pasta)( |$)/,
    kinds: ['spaghetti', 'penne', 'fusilli', 'tagliatelle', 'farfalle', 'rigatoni', 'makkaroni', 'spirelli', 'linguine', 'bandnudel']
      .map(w => ({ re: new RegExp(w), grp: 'pasta' })) },
  { id: 'tomaten-dose',
    generic: /passata|passiert|stuckig|dosentomat|(gehackt|geschalt)\w* tomat|tomat\w* (gehackt|geschalt)/,
    kinds: [] },
  { id: 'kase',
    generic: /(^| )(kase|reibekase|streukase)( |$)/,
    kinds: ['gouda', 'emmentaler', 'edamer', 'cheddar', 'butterkase', 'tilsiter', 'bergkase', 'gruyere', 'appenzeller']
      .map(w => ({ re: new RegExp(w), grp: 'hart' })) },
  { id: 'sahne',
    generic: /(^| )(sahne|schlagsahne|kochsahne|kuchensahne)( |$)/,
    kinds: [] },
  { id: 'milch',
    generic: /(^| )(milch|vollmilch|frischmilch|hmilch)( |$)/,
    exclude: /kokos|mandel|hafer|soja|reis|nuss|dosen|kondens/,
    kinds: [] },
  { id: 'bruehe',
    generic: /(^| )(bruhe|gemusebruhe|bruhwurfel|bruhpulver|instantbruhe|gemusefond|gemusebouillon|bouillon)( |$)/,
    exclude: /huhn|rind|fleisch|knochen|fisch/,
    kinds: [] },
  { id: 'mehl',
    generic: /(^| )(mehl|weizenmehl)( |$)|mehl (typ )?405|type 405/,
    exclude: /dinkel|vollkorn|roggen|reis|mais|kicher|hafer|buchweizen|mandel|kokos|protein|backmischung/,
    kinds: [] },
  { id: 'zucker',
    generic: /(^| )(zucker|haushaltszucker|kristallzucker|raffinade|streuzucker)( |$)/,
    exclude: /braun|rohr|puder|staub|vanille|gelier|kandis|hagel|farin|muscovado|kokos|palm/,
    kinds: [] },
  { id: 'knoblauch',
    generic: /(^| )(knoblauch|knoblauchzehe|knoblauchzehen)( |$)/,
    exclude: /pulver|granulat|salz|gewurz|paste/,
    kinds: [] },
  { id: 'reis',
    generic: /(^| )reis( |$)/,
    kinds: [
      { re: /basmati/, grp: 'lang' }, { re: /jasmin/, grp: 'lang' }, { re: /langkorn/, grp: 'lang' },
      { re: /(natur|vollkorn)reis|vollkorn.*reis/, grp: 'natur' }, { re: /rundkorn|risotto|arborio|milchreis/ }
    ] },
  { id: 'joghurt',
    generic: /(^| )(joghurt|jogurt|naturjoghurt)( |$)/,
    kinds: [] },
  { id: 'hack',
    generic: /(^| )(hack|hackfleisch)( |$)/,
    kinds: [
      { re: /rinder ?hack|hack\w* rind|rind\w* hack/, grp: 'hack' }, { re: /schwein\w* hack|hack\w* schwein/, grp: 'hack' },
      { re: /gemischt/, grp: 'hack' }
    ] }
];

function inFamily(f, folded){
  if(f.exclude && f.exclude.test(folded)) return false;
  return f.generic.test(folded) || f.kinds.some(k => k.re.test(folded));
}

function familyOf(folded){
  return FAMILIES.find(f => inFamily(f, folded)) || null;
}

function kindOf(f, folded){
  return f.kinds.findIndex(k => k.re.test(folded));
}

// Stufe: 0 = passt, 1 = Vorrat ist allgemeiner als das Rezept (Öl statt Olivenöl),
// 2 = andere Art derselben Gruppe (Rapsöl statt Olivenöl), null = passt nicht.
function familyLevel(f, recipeFold, itemFold){
  if(!inFamily(f, itemFold)) return null;
  const rk = kindOf(f, recipeFold), ik = kindOf(f, itemFold);
  if(rk === ik || rk === -1) return 0;
  if(ik === -1) return 1;
  const g1 = f.kinds[rk].grp, g2 = f.kinds[ik].grp;
  return g1 && g1 === g2 ? 2 : null;
}

function nameLevel(recipeName, itemName){
  const a = coreTokens(recipeName), b = coreTokens(itemName);
  if(!a.size || a.size !== b.size) return null;
  for(const t of a) if(!b.has(t)) return null;
  return 0;
}

// ---------- Abgleich ----------

export function isStaple(name, staples = DEFAULT_STAPLES){
  const key = normKey(name);
  return !!key && staples.some(s => normKey(s) === key);
}

// Findet die passenden Vorratsartikel zu einem Zutatennamen.
// Rückgabe: { via, items, substitute }; via = 'staple' | 'alias' | 'family' | 'name' | null.
export function matchItems(name, inventory, ctx = {}){
  const key = normKey(name);
  if(!key) return { via: null, items: [], substitute: false };
  if(isStaple(name, ctx.staples || DEFAULT_STAPLES)) return { via: 'staple', items: [], substitute: false };

  const target = ctx.aliases && ctx.aliases[key];
  if(target){
    const tk = normKey(target);
    const items = inventory.filter(i => normKey(i.name) === tk);
    if(items.length) return { via: 'alias', items, substitute: false };
  }

  const rf = cleanFold(name);
  const fam = familyOf(rf);
  const found = [];
  for(const item of inventory){
    const level = fam ? familyLevel(fam, rf, cleanFold(item.name)) : nameLevel(name, item.name);
    if(level !== null) found.push({ item, level });
  }
  if(!found.length) return { via: null, items: [], substitute: false };
  const best = Math.min(...found.map(f => f.level));
  return { via: fam ? 'family' : 'name', items: found.map(f => f.item), substitute: best > 0 };
}

// ---------- Mengenprüfung ----------

function isLoose(ing, q, items){
  if(ing.approx) return true;
  if(!q) return true;
  if(items.some(i => i.category === 'Gewürze & Saucen')) return true;
  const info = unitInfo(ing.unit);
  if(info && LOOSE_UNITS.has(info.label)) return true;
  if((q.dim === 'mass' || q.dim === 'volume') && q.value < LOOSE_BELOW) return true;
  return false;
}

const RANK = { genug: 0, grundvorrat: 0, da: 1, knapp: 2, fehlt: 3 };

// Bewertet eine Zutat gegen den Vorrat. factor skaliert die Rezeptmenge (Portionen).
// status: genug | da (vorhanden, Menge nicht prüfbar oder locker) | knapp | fehlt | grundvorrat
export function evaluateIngredient(ing, inventory, ctx = {}, factor = 1){
  const name = String(ing.name ?? '').trim();

  const alts = name.split(/\s+oder\s+/i).map(s => s.trim()).filter(Boolean);
  if(alts.length > 1){
    const results = alts.map(a => ({ ...evaluateIngredient({ ...ing, name: a }, inventory, ctx, factor), alt: a }));
    return results.reduce((best, r) => RANK[r.status] < RANK[best.status] ? r : best);
  }

  const staples = ctx.staples || DEFAULT_STAPLES;
  const parts = name.split(/\s+und\s+/i);
  if(parts.length > 1 && parts.every(p => isStaple(p, staples))){
    return { status: 'grundvorrat', items: [], substitute: false };
  }

  const m = matchItems(name, inventory, ctx);
  if(m.via === 'staple') return { status: 'grundvorrat', items: [], substitute: false };
  if(!m.items.length) return { status: 'fehlt', items: [], substitute: false };

  const n = parseAmount(ing.amount);
  const q = n === null ? null : qty(n * factor, ing.unit);
  const base = { items: m.items, substitute: m.substitute, via: m.via };
  if(isLoose(ing, q, m.items)) return { status: 'da', ...base };

  const stocks = m.items.map(i => stockIn(i, q.dim)).filter(v => v !== null);
  if(!stocks.length) return { status: 'da', ...base };
  const have = stocks.reduce((a, b) => a + b, 0);
  const need = q.value;
  if(have >= need * TOLERANCE) return { status: 'genug', have, need, dim: q.dim, ...base };
  if(stocks.length < m.items.length) return { status: 'da', ...base };
  return { status: 'knapp', have, need, short: need - have, dim: q.dim, ...base };
}

export function isOk(status){
  return status === 'genug' || status === 'da' || status === 'grundvorrat';
}

// Bewertet alle Zutaten eines Rezepts. Rückgabe: { rows, missing, short, ok, total }.
export function evaluateRecipe(recipe, inventory, ctx = {}, factor = 1){
  const rows = (recipe.ingredients || []).map(ing => ({ ing, ...evaluateIngredient(ing, inventory, ctx, factor) }));
  const missing = rows.filter(r => r.status === 'fehlt');
  const short = rows.filter(r => r.status === 'knapp');
  return { rows, missing, short, ok: missing.length === 0 && short.length === 0, total: rows.length };
}

// Kurztext für Rezeptkarten: "alles da", "2 fehlen", "1 fehlt, 1 knapp".
export function summaryText(ev){
  if(ev.total === 0) return 'keine Zutaten';
  if(ev.ok) return 'alles da';
  const parts = [];
  if(ev.missing.length) parts.push(ev.missing.length + (ev.missing.length === 1 ? ' fehlt' : ' fehlen'));
  if(ev.short.length) parts.push(ev.short.length + ' knapp');
  return parts.join(', ');
}

// Text zur Fehlmenge einer knappen Zutat ("noch 150 g").
export function shortText(row){
  return row.status === 'knapp' ? formatBase(row.dim, row.short) : '';
}
