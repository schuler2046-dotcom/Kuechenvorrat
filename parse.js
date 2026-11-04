// Zutatenzeilen-Parser: zerlegt Texte wie "200 g Mehl" in Name, Menge und Einheit.

const KNOWN_UNITS = ['g','kg','mg','ml','l','tl','el','stk','stück','dose','dosen','packung','päckchen','pck','prise','bund','zehe','zehen','stange','stangen','scheibe','scheiben','becher','glas','gläser','flasche','flaschen','tasse','tassen','kopf','köpfe','tüte','tüten','msp','messerspitze','esslöffel','teelöffel','liter','gramm','kilogramm','milliliter','blatt','blätter','zweig','zweige','handvoll','portion','portionen','würfel','riegel','tropfen'];

// Zerlegt eine Zutaten-/Artikelzeile in Bezeichnung, Menge und Einheit. Erkennt die
// Menge sowohl am Anfang ("200 g Mehl", "200g Mehl") als auch am Ende ("Mehl 200 g",
// "Mehl 200g", "Karotten 2"). Unterstützt Ziffern, Dezimalzahlen (1,5 / 1.5),
// Brüche (1/2) und Unicode-Brüche (½). Die Einheit darf direkt ankleben.
const FRACTION_MAP = { '½':'0.5','¼':'0.25','¾':'0.75','⅓':'1/3','⅔':'2/3','⅛':'0.125','⅜':'0.375' };
const AMOUNT_RE = '(?:[½¼¾⅓⅔⅛⅜]|\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+)?)';

function normalizeAmount(a){
  return FRACTION_MAP[a] || a.replace(/\s+/g,'');
}

// Entfernt führende Aufzählungszeichen und umschließende Trennzeichen aus dem Namen.
function cleanIngredientName(s){
  return String(s || '').replace(/^[\s:–—\-•·▪◦‣*]+/,'').replace(/[\s:–—\-]+$/,'').trim();
}

function isKnownUnitWord(w){
  return !!w && KNOWN_UNITS.includes(w.toLowerCase().replace(/\.+$/,''));
}

export function parseIngredientLine(line){
  let raw = String(line || '').trim();
  if(!raw) return null;
  // Führende Aufzählungszeichen entfernen ("• ", "- ", "* ", "– " usw.).
  raw = raw.replace(/^[•·▪◦‣*\-–—]+\s+/, '').trim();
  if(!raw) return null;
  // "2x Paprika" / "2 x Paprika" -> "2 Paprika".
  raw = raw.replace(new RegExp('^(' + AMOUNT_RE + ')\\s*[x×]\\s+', 'i'), '$1 ');

  // A) Menge in Klammern am Ende: "Paprika (2 Stück)".
  const paren = raw.match(new RegExp('^(.*?)\\s*\\((' + AMOUNT_RE + ')\\s*([A-Za-zÄÖÜäöüß.]*)\\)\\s*$'));
  if(paren && (paren[3] === '' || isKnownUnitWord(paren[3]))){
    const name = cleanIngredientName(paren[1]);
    if(name) return { name, amount: normalizeAmount(paren[2]), unit: paren[3] ? paren[3].replace(/\.+$/,'') : '' };
  }

  // B) Menge am Anfang der Zeile ("200 g Mehl", "200g Mehl", "1/2 TL Salz").
  const lead = raw.match(new RegExp('^(' + AMOUNT_RE + ')\\s*(.*)$'));
  if(lead){
    let rest = lead[2].replace(/^[\s:–—\-]+/,'');
    let unit = '';
    const um = rest.match(/^([A-Za-zÄÖÜäöüß.]+)/);
    if(um && isKnownUnitWord(um[1])){
      unit = um[1].replace(/\.+$/,'');
      rest = rest.slice(um[1].length).replace(/^[\s.:–—\-]+/,'');
    }
    const name = cleanIngredientName(rest);
    if(name) return { name, amount: normalizeAmount(lead[1]), unit };
    // Nur Zahl/Einheit ohne Namen – dann lieber den Rohtext als Namen behalten.
    return { name: cleanIngredientName(raw), amount: '', unit: '' };
  }

  // C) Menge am Ende der Zeile ("Mehl 200 g", "Mehl - 200g", "Karotten 2").
  const trail = raw.match(new RegExp('^(.*\\S)\\s+(' + AMOUNT_RE + ')\\s*([A-Za-zÄÖÜäöüß.]*)$'));
  if(trail && (trail[3] === '' || isKnownUnitWord(trail[3]))){
    const name = cleanIngredientName(trail[1]);
    if(name) return { name, amount: normalizeAmount(trail[2]), unit: trail[3] ? trail[3].replace(/\.+$/,'') : '' };
  }

  // D) Keine Menge erkennbar.
  return { name: cleanIngredientName(raw), amount: '', unit: '' };
}

// Zerlegt eine bereits eingetragene Zutat nachträglich, falls die Menge noch komplett
// im Namensfeld steckt (z. B. manuell "200g Mehl" getippt). Eine bereits gesetzte
// Menge wird nie überschrieben.
export function normalizeIngredient(ing){
  if(!ing) return ing;
  const nm = String(ing.name || '').trim();
  if(!nm || String(ing.amount || '').trim()) return ing;
  const p = parseIngredientLine(nm);
  if(p && p.amount){
    return { name: p.name, amount: p.amount, unit: (ing.unit && ing.unit.trim()) ? ing.unit : p.unit };
  }
  return ing;
}
