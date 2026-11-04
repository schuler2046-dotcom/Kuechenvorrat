// Einheiten, Mengen und Packungsgrößen – reine Funktionen ohne DOM.
//
// Mengen werden in Basiseinheiten verglichen: Masse in g, Volumen in ml, Stück in stk.
// Gebinde und Teileinheiten (Packung, Dose, Bund, Zehe …) bilden eigene Dimensionen
// ("item:Packung"). Sie lassen sich nur dann in g/ml umrechnen, wenn am Artikel eine
// Packungsgröße hinterlegt ist (packSize + packUnit). Alte Daten ("Stück", "EL", "Zehen",
// Menge als Text) werden nur gelesen und nie umgeschrieben.

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375 };

// Zählbare Gebinde/Teileinheiten: Singular, Plural.
const ITEM_LABELS = {
  Packung: ['Packung', 'Packungen'], Päckchen: ['Päckchen', 'Päckchen'], Dose: ['Dose', 'Dosen'],
  Glas: ['Glas', 'Gläser'], Flasche: ['Flasche', 'Flaschen'], Becher: ['Becher', 'Becher'],
  Tüte: ['Tüte', 'Tüten'], Zehe: ['Zehe', 'Zehen'], Stange: ['Stange', 'Stangen'],
  Scheibe: ['Scheibe', 'Scheiben'], Kopf: ['Kopf', 'Köpfe'], Blatt: ['Blatt', 'Blätter'],
  Zweig: ['Zweig', 'Zweige'], Bund: ['Bund', 'Bund'], Würfel: ['Würfel', 'Würfel'],
  Riegel: ['Riegel', 'Riegel'], Handvoll: ['Handvoll', 'Handvoll'], Portion: ['Portion', 'Portionen']
};

// Kleinschreibung -> [Dimension, Faktor in Basiseinheit, kanonisches Label]
const UNITS = {};
function add(names, dim, factor, label){ names.forEach(n => { UNITS[n] = { dim, factor, label }; }); }

add(['mg'], 'mass', 0.001, 'mg');
add(['g', 'gramm', 'gr'], 'mass', 1, 'g');
add(['kg', 'kilo', 'kilogramm'], 'mass', 1000, 'kg');
add(['prise', 'prisen'], 'mass', 0.5, 'Prise');
add(['msp', 'messerspitze', 'messerspitzen'], 'mass', 0.5, 'Msp');
add(['ml', 'milliliter'], 'volume', 1, 'ml');
add(['cl'], 'volume', 10, 'cl');
add(['dl'], 'volume', 100, 'dl');
add(['l', 'liter'], 'volume', 1000, 'l');
add(['tl', 'teelöffel'], 'volume', 5, 'TL');
add(['el', 'esslöffel'], 'volume', 15, 'EL');
add(['tropfen'], 'volume', 0.05, 'Tropfen');
add(['tasse', 'tassen', 'cup', 'cups'], 'volume', 250, 'Tasse');
add(['', 'stk', 'stk.', 'st', 'st.', 'stück', 'stücke', 'x'], 'count', 1, 'stk');
add(['packung', 'packungen', 'pck', 'pck.', 'pk'], 'item:Packung', 1, 'Packung');
add(['päckchen'], 'item:Päckchen', 1, 'Päckchen');
add(['dose', 'dosen'], 'item:Dose', 1, 'Dose');
add(['glas', 'gläser'], 'item:Glas', 1, 'Glas');
add(['flasche', 'flaschen'], 'item:Flasche', 1, 'Flasche');
add(['becher'], 'item:Becher', 1, 'Becher');
add(['tüte', 'tüten'], 'item:Tüte', 1, 'Tüte');
add(['zehe', 'zehen'], 'item:Zehe', 1, 'Zehe');
add(['stange', 'stangen'], 'item:Stange', 1, 'Stange');
add(['scheibe', 'scheiben'], 'item:Scheibe', 1, 'Scheibe');
add(['kopf', 'köpfe'], 'item:Kopf', 1, 'Kopf');
add(['blatt', 'blätter'], 'item:Blatt', 1, 'Blatt');
add(['zweig', 'zweige'], 'item:Zweig', 1, 'Zweig');
add(['bund'], 'item:Bund', 1, 'Bund');
add(['würfel'], 'item:Würfel', 1, 'Würfel');
add(['riegel'], 'item:Riegel', 1, 'Riegel');
add(['handvoll'], 'item:Handvoll', 1, 'Handvoll');
add(['portion', 'portionen'], 'item:Portion', 1, 'Portion');

// Einheiten für Auswahllisten.
export const UNIT_OPTIONS = ['stk', 'g', 'kg', 'mg', 'ml', 'l', 'Packung', 'Dose', 'Glas', 'Flasche', 'Becher', 'Tüte', 'Bund', 'Päckchen'];
export const RECIPE_UNIT_OPTIONS = ['stk', 'g', 'kg', 'mg', 'ml', 'l'];

// Liefert {dim, factor, label} oder null bei unbekannter Einheit.
export function unitInfo(unit){
  const key = String(unit ?? '').trim().toLowerCase().replace(/\.+$/, '');
  return UNITS[key] || UNITS[key + '.'] || null;
}

export function isItemUnit(unit){
  const i = unitInfo(unit);
  return !!i && i.dim.startsWith('item:');
}

// Kanonische Schreibweise für neue Eingaben ("Stück" -> "stk", "Liter" -> "l").
// Unbekanntes bleibt unverändert, damit nichts verloren geht.
export function canonicalUnit(unit){
  const raw = String(unit ?? '').trim();
  const i = unitInfo(raw);
  if(!i) return raw;
  if(i.dim === 'count') return raw === '' ? '' : 'stk';
  return i.label;
}

// Text oder Zahl -> Zahl. Versteht "1,5", "1/2", "1 1/2", "½", "1½". Sonst null.
export function parseAmount(v){
  if(typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim().toLowerCase();
  if(!s) return null;
  if(s in FRACTIONS) return FRACTIONS[s];
  let m = s.match(/^(\d+)\s*([½¼¾⅓⅔⅛⅜])$/);
  if(m) return Number(m[1]) + FRACTIONS[m[2]];
  m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if(m) return Number(m[3]) ? Number(m[1]) + Number(m[2]) / Number(m[3]) : null;
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if(m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
  m = s.match(/^\d+(?:[.,]\d+)?$/);
  if(m) return parseFloat(s.replace(',', '.'));
  return null;
}

// Menge als Basiswert: {dim, value, n, base?}. `base` gibt bei Gebinden mit
// Packungsgröße den Wert in g/ml/stk an. Null, wenn die Menge nicht lesbar ist.
export function qty(amount, unit, packSize, packUnit){
  const n = parseAmount(amount);
  if(n === null) return null;
  const info = unitInfo(unit);
  const dim = info ? info.dim : 'unknown:' + String(unit).trim().toLowerCase();
  const q = { dim, value: n * (info ? info.factor : 1), n };
  const size = parseAmount(packSize);
  if(info && info.dim.startsWith('item:') && size){
    const pi = unitInfo(packUnit || 'g');
    if(pi && !pi.dim.startsWith('item:')) q.base = { dim: pi.dim, value: n * size * pi.factor };
  }
  return q;
}

// Wert einer Menge in der Basiseinheit der Dimension `dim`, sonst null.
export function valueIn(q, dim){
  if(!q) return null;
  if(q.dim === dim) return q.value;
  if(q.base && q.base.dim === dim) return q.base.value;
  return null;
}

// Wie viel Basiswert (g/ml/stk) entspricht 1 Einheit des Artikels in `dim`? Null, wenn nicht umrechenbar.
function perUnit(item, dim){
  const info = unitInfo(item.unit);
  if(!info) return null;
  if(info.dim === dim) return info.factor;
  const size = parseAmount(item.packSize);
  if(info.dim.startsWith('item:') && size){
    const pi = unitInfo(item.packUnit || 'g');
    if(pi && pi.dim === dim) return size * pi.factor;
  }
  return null;
}

// Vorhandene Menge eines Vorratsartikels in `dim` (z. B. 'mass'), sonst null.
export function stockIn(item, dim){
  const n = parseAmount(item.amount);
  const p = perUnit(item, dim);
  return n === null || p === null ? null : n * p;
}

// Neue Menge eines Artikels (in dessen eigener Einheit) nach Abzug von `value` in `dim`.
// Nie unter 0. Null, wenn nicht umrechenbar.
export function reduceAmount(item, value, dim){
  const n = parseAmount(item.amount);
  const p = perUnit(item, dim);
  if(n === null || p === null) return null;
  return roundTo(Math.max(0, n - value / p), 3);
}

// Addiert zwei Mengen. Ergebnis in der Einheit von a. Null, wenn die Einheiten nicht zusammenpassen.
export function addAmounts(aAmount, aUnit, bAmount, bUnit){
  const a = parseAmount(aAmount), b = parseAmount(bAmount);
  if(a === null || b === null) return null;
  const ia = unitInfo(aUnit), ib = unitInfo(bUnit);
  if(ia && ib && ia.dim === ib.dim){
    return { amount: roundTo((a * ia.factor + b * ib.factor) / ia.factor, 3), unit: aUnit };
  }
  if(!ia && !ib && String(aUnit).trim().toLowerCase() === String(bUnit).trim().toLowerCase()){
    return { amount: roundTo(a + b, 3), unit: aUnit };
  }
  return null;
}

export function roundTo(n, dec){
  const f = 10 ** dec;
  return Math.round(n * f) / f;
}

// Schrittweite des Plus/Minus-Knopfes je Einheit.
export function stepFor(unit){
  const i = unitInfo(unit);
  if(!i) return 1;
  switch(i.label){
    case 'g': case 'ml': return 50;
    case 'mg': return 100;
    case 'kg': case 'l': return 0.5;
    default: return 1;
  }
}

// ---------- Formatierung ----------

function fmtNum(n, dec = 2){
  return roundTo(n, dec).toLocaleString('de-DE', { maximumFractionDigits: dec });
}

// Zählmengen mit Brüchen: 0,5 -> "½", 1,25 -> "1¼".
function fmtFrac(n){
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  if(frac < 0.04) return fmtNum(whole);
  if(frac > 0.96) return fmtNum(whole + 1);
  for(const [v, c] of [[0.25, '¼'], [0.5, '½'], [0.75, '¾']]){
    if(Math.abs(frac - v) < 0.04) return (whole ? String(whole) : '') + c;
  }
  return fmtNum(n);
}

export function formatMass(g){
  if(g < 1) return fmtNum(g * 1000, 0) + ' mg';
  if(g < 1000) return fmtNum(g, g < 10 ? 1 : 0) + ' g';
  return fmtNum(g / 1000, 2) + ' kg';
}

export function formatVolume(ml){
  if(ml < 1000) return fmtNum(ml, ml < 10 ? 1 : 0) + ' ml';
  return fmtNum(ml / 1000, 2) + ' l';
}

// Basiswert einer Dimension lesbar ausgeben ("1,5 kg", "250 ml", "3 stk").
export function formatBase(dim, value){
  if(dim === 'mass') return formatMass(value);
  if(dim === 'volume') return formatVolume(value);
  if(dim === 'count') return fmtFrac(value) + ' stk';
  if(String(dim).startsWith('item:')){
    const label = String(dim).slice(5);
    const [one, many] = ITEM_LABELS[label] || [label, label];
    return fmtFrac(value) + ' ' + (value > 1.04 ? many : one);
  }
  return fmtNum(value);
}

// Menge + Einheit lesbar und metrisch. Alte Einheiten werden umgerechnet
// (2 EL -> "30 ml"), unlesbare Mengen bleiben als Text stehen.
export function formatQuantity(amount, unit){
  const n = parseAmount(amount);
  const info = unitInfo(unit);
  if(n === null){
    return [String(amount ?? '').trim(), String(unit ?? '').trim()].filter(Boolean).join(' ');
  }
  if(!info) return fmtNum(n) + (String(unit ?? '').trim() ? ' ' + String(unit).trim() : '');
  const base = n * info.factor;
  if(info.dim === 'mass') return formatMass(base);
  if(info.dim === 'volume') return formatVolume(base);
  if(info.dim === 'count') return fmtFrac(n) + (String(unit ?? '').trim() ? ' stk' : '');
  const [one, many] = ITEM_LABELS[info.label] || [info.label, info.label];
  return fmtFrac(n) + ' ' + (n > 1.04 ? many : one);
}

// Basiswert einer Dimension als Menge + passende Einheit (für Einkaufslisten).
export function partsFromBase(dim, value){
  if(dim === 'mass'){
    if(value < 1) return { amount: roundTo(value * 1000, 0), unit: 'mg' };
    if(value >= 1000) return { amount: roundTo(value / 1000, 2), unit: 'kg' };
    return { amount: roundTo(value, value < 10 ? 1 : 0), unit: 'g' };
  }
  if(dim === 'volume'){
    if(value >= 1000) return { amount: roundTo(value / 1000, 2), unit: 'l' };
    return { amount: roundTo(value, value < 10 ? 1 : 0), unit: 'ml' };
  }
  if(dim === 'count') return { amount: roundTo(value, 2), unit: 'stk' };
  if(String(dim).startsWith('item:')) return { amount: roundTo(value, 2), unit: String(dim).slice(5) };
  return { amount: roundTo(value, 2), unit: '' };
}

// Menge + beliebige Einheit metrisch ausdrücken (2 EL -> 30 ml). Unbekanntes bleibt unverändert.
export function metricParts(amount, unit){
  const n = parseAmount(amount);
  if(n === null) return { amount: String(amount ?? '').trim(), unit: canonicalUnit(unit) };
  const info = unitInfo(unit);
  if(!info) return { amount: n, unit: String(unit ?? '').trim() };
  if(info.dim === 'count') return { amount: roundTo(n, 2), unit: String(unit ?? '').trim() === '' ? '' : 'stk' };
  return partsFromBase(info.dim, n * info.factor);
}

// ---------- Packungsgrößen ----------

// Übliche Packungsgrößen als Vorschlag beim Anlegen eines Packungs-Artikels.
// Reihenfolge ist wichtig: der erste passende Eintrag gewinnt.
const PACK_DEFAULTS = [
  [/puderzucker/i, 500, 'g'],
  [/vanillezucker/i, 8, 'g'],
  [/backpulver/i, 15, 'g'],
  [/zucker/i, 1000, 'g'],
  [/mehl/i, 1000, 'g'],
  [/spaghetti|nudel|penne|fusilli|pasta|makkaroni|tagliatelle|farfalle|rigatoni|spirelli/i, 500, 'g'],
  [/reis/i, 1000, 'g'],
  [/passiert|passata/i, 500, 'g'],
  [/tomate/i, 400, 'g'],
  [/schokolade/i, 100, 'g'],
  [/butter|margarine/i, 250, 'g'],
  [/kokosmilch/i, 400, 'ml'],
  [/sahne/i, 200, 'ml'],
  [/milch/i, 1000, 'ml'],
  [/haferflocken/i, 500, 'g'],
  [/quark|joghurt/i, 500, 'g']
];

export function suggestPackSize(name){
  const n = String(name ?? '');
  for(const [re, size, unit] of PACK_DEFAULTS){
    if(re.test(n)) return { size, unit };
  }
  return null;
}
