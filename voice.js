// Aufbereitung diktierter Einkaufszeilen (Spracherkennung selbst bleibt in app.js).

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

// Erkennt, ob ein Wort eine Mengenangabe ist (Ziffer oder Zahlwort) – dient als
// Startsignal für einen neuen Artikel innerhalb eines pausenlosen Satzes.
function isQuantityToken(t){
  const lw = t.toLowerCase().replace(/[.,;:!?]+$/,'');
  return /^\d+([.,]\d+)?$/.test(lw) || Object.prototype.hasOwnProperty.call(NUM_WORDS, lw);
}

// Trennt eine pausenlose Phrase vor jeder Mengenangabe auf, z. B.
// „zwei Kilo Kartoffeln drei Dosen Kichererbsen" -> ["zwei Kilo Kartoffeln", "drei Dosen Kichererbsen"].
function splitBeforeQuantities(phrase){
  const tokens = phrase.trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = [];
  tokens.forEach((t, i) => {
    if(i > 0 && cur.length && isQuantityToken(t)){
      lines.push(cur.join(' '));
      cur = [t];
    } else {
      cur.push(t);
    }
  });
  if(cur.length) lines.push(cur.join(' '));
  return lines;
}

// Wandelt den erkannten Sprachtext in einzelne Artikelzeilen um. Getrennt wird an
// drei Signalen: Sprechpausen (Zeilenumbrüche aus den Erkennungs-Abschnitten),
// Satzzeichen/Bindewörter und Mengenangaben mitten im Satz.
export function spokenToLines(text){
  const coarse = text.split(/\s*[\n,;]\s*|\s+und\s+|\s+sowie\s+/i).map(s => s.trim()).filter(Boolean);
  const out = [];
  coarse.forEach(part => splitBeforeQuantities(part).forEach(l => { if(l.trim()) out.push(l.trim()); }));
  return out.map(normalizeSpokenLine).filter(Boolean);
}
