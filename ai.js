// Copy-Paste-Workflow mit der Claude-App: Prompts bauen und Antworten einlesen.

import { LOCATIONS, CATEGORIES, TAGS } from './constants.js';
import { uid } from './util.js';

export function buildAiPrompt(inventory){
  const invText = inventory.length
    ? inventory.map(i => '- ' + i.name + (i.amount ? ' (' + i.amount + (i.unit ? ' ' + i.unit : '') + ')' : '')).join('\n')
    : '- (aktuell ist nichts eingetragen)';
  return 'Du bist ein Kochassistent für eine deutschsprachige Küche.\n\n' +
    '━━━ WICHTIGSTE REGEL – GILT FÜR DIESEN GESAMTEN CHAT, AB JETZT, BEI JEDER EINZELNEN REZEPT-ANTWORT ━━━\n' +
    'Sobald ich dich (in dieser oder einer späteren Nachricht) nach einem Rezept frage, antwortest du IMMER im ' +
    '„KOCHMODUS"-FORMAT, direkt als Text hier im Chat (niemals als Datei, Download oder Artefakt), in GENAU ZWEI Teilen ' +
    'in derselben Nachricht:\n\n' +
    '① KOCHMODUS-ANSICHT (lesbarer Text, KEIN JSON): Überschrift mit dem Gerichtnamen, dann „Zutaten" als Liste mit ' +
    'Mengenangaben, danach „Zubereitung" als kurze nummerierte Schritte.\n\n' +
    '② DATENBLOCK (direkt im Anschluss, klar getrennt): GENAU EIN JSON-Array mit denselben Angaben, exakt in diesem ' +
    'Format (darf in einem Codeblock stehen):\n' +
    '[{"name": "Gerichtname", "aufwand": "schnell", "zeit": "ca. 20 Min", "tags": ["nur Werte aus dieser Liste: ' + TAGS.join(', ') + '"], "ingredients": [{"name": "Zutat", "amount": "200", "unit": "g"}], "steps": ["Erster Schritt.", "Zweiter Schritt."], "notes": "Kurzbeschreibung in einem Satz"}]\n\n' +
    'Diese Zwei-Teile-Regel gilt für JEDE Rezept-Antwort in diesem Chat, auch bei einem zweiten oder dritten Rezept – ' +
    'nicht vergessen. Ich kopiere später deine GESAMTE Antwort (Kochmodus-Ansicht + JSON zusammen) in meine App; dort ' +
    'wird automatisch nur der JSON-Teil herausgefiltert, um den lesbaren Teil musst du dich nicht extra kümmern.\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    'Das ist unser aktueller Küchenvorrat – nur die vorhandenen Zutaten, ohne weitere Vorgaben von mir:\n' + invText + '\n\n' +
    'Antworte auf DIESE Nachricht nur kurz, dass du bereit bist – schlage jetzt noch KEIN Rezept vor. ' +
    'Ich sage dir in einer der nächsten Nachrichten hier im Chat individuell, worauf ich gerade Lust habe oder was ich kochen möchte ' +
    '(z. B. eine bestimmte Zutat, ein Gericht, eine Kategorie oder auch einfach „überrasch mich").\n\n' +
    'Sobald ich dir sage, was ich kochen möchte, schlägst du GENAU 1 passendes Rezept vor (nur wenn ich ausdrücklich mehrere ' +
    'Vorschläge oder eine Auswahl wünsche, entsprechend mehr) – im oben festgelegten Kochmodus-Format. Das Rezept soll ' +
    'überwiegend aus dem oben genannten Vorrat bestehen; einzelne zusätzliche Zutaten sind erlaubt (sie werden in der App ' +
    'als fehlend markiert).\n\n' +
    'EINHEITEN: Verwende ausschließlich deutsche/metrische Einheiten mit genauen Endmengen – "g", "mg" und "kg" für Gewicht, ' +
    '"ml" und "l" für Flüssigkeiten, außerdem "EL", "TL", "Stück", "Prise", "Bund", "Dose", "Packung". Niemals cups, ounces, oz, ' +
    'pounds, lbs oder Fahrenheit. Temperaturen immer in °C. Gib möglichst genaue Mengen an statt nur „nach Geschmack".\n\n' +
    'ZUBEREITUNG: Im Feld "steps" bzw. im Kochmodus-Abschnitt „Zubereitung" 3 bis 6 kurze Zubereitungsschritte – je ein ' +
    'Satz, in der Reihenfolge des Kochens. "notes" enthält zusätzlich eine Kurzbeschreibung in einem Satz.';
}

// ---------- Foto-Erfassung (Copy-Paste über die Claude-App) ----------

export function buildPhotoPrompt(){
  return 'Du hilfst beim Erfassen eines Lebensmitteleinkaufs für eine deutschsprachige Küchenvorrat-App.\n\n' +
    'Auf dem Foto, das ich dir in dieser Nachricht anhänge, sind eingekaufte Lebensmittel zu sehen. ' +
    'Erkenne alle eindeutig sichtbaren Produkte. Fasse mehrere gleiche Produkte zu einem Eintrag mit passender Menge zusammen. ' +
    'Rate nichts, was du nicht erkennen kannst.\n\n' +
    'Gib für jedes Produkt an:\n' +
    '- name: kurze deutsche Bezeichnung (z. B. "Vollmilch", "Hähnchenbrust", "Tiefkühl-Erbsen")\n' +
    '- amount: Anzahl oder Menge falls erkennbar, sonst "1"\n' +
    '- unit: Einheit falls erkennbar (g, kg, ml, l, Stück, Packung, Dose), sonst ""\n' +
    '- location: typischer Lagerort, GENAU einer aus dieser Liste: ' + LOCATIONS.join(', ') + '\n' +
    '- category: GENAU eine aus dieser Liste: ' + CATEGORIES.join(', ') + '\n\n' +
    'Ordne den Lagerort nach üblicher Aufbewahrung zu: Tiefkühlware in die Gefriertruhe; ' +
    'Frischware, Fleisch, Fisch und Milchprodukte in den Kühlschrank; haltbare Ware, Konserven und Trockenware in den Vorratsschrank.\n\n' +
    'Antworte AUSSCHLIESSLICH mit einem JSON-Array in exakt diesem Format, ohne Markdown-Codeblock und ohne Text davor oder danach:\n' +
    '[{"name": "Vollmilch", "amount": "1", "unit": "l", "location": "Kühlschrank", "category": "Milchprodukte"}]';
}

// Holt das JSON-Array (oder ein einzelnes Objekt) aus einer Claude-Antwort, auch wenn
// Fließtext oder Markdown-Codeblöcke drumherum stehen. Gibt immer ein Array zurück.
export function extractJsonArray(raw){
  const clean = String(raw).replace(/```json|```/g, '').trim();
  let jsonText = clean;
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if(start >= 0 && end > start){
    jsonText = clean.slice(start, end + 1);
  } else {
    const os = clean.indexOf('{'); const oe = clean.lastIndexOf('}');
    if(os >= 0 && oe > os) jsonText = '[' + clean.slice(os, oe + 1) + ']';
  }
  const parsed = JSON.parse(jsonText);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function parsePhotoItems(raw){
  const result = extractJsonArray(raw)
    .filter(r => r && typeof r.name === 'string' && r.name.trim())
    .map(r => ({
      id: uid(),
      name: String(r.name).trim(),
      amount: String(r.amount || '1').trim() || '1',
      unit: String(r.unit || '').trim(),
      location: LOCATIONS.includes(r.location) ? r.location : 'Vorratsschrank',
      category: CATEGORIES.includes(r.category) ? r.category : 'Sonstiges'
    }));
  if(result.length === 0) throw new Error('keine Produkte erkannt');
  return result;
}

export function parseAiRecipes(raw){
  const result = extractJsonArray(raw)
    .filter(r => r && typeof r.name === 'string' && r.name.trim())
    .map(r => ({
      name: r.name.trim(),
      aufwand: (String(r.aufwand || '').toLowerCase().startsWith('aufw')) ? 'aufwändig' : 'schnell',
      zeit: String(r.zeit || '').trim(),
      tags: (Array.isArray(r.tags) ? r.tags : []).filter(t => TAGS.includes(t)),
      ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).map(i => ({
        name: String(i.name || '').trim(), amount: String(i.amount || ''), unit: String(i.unit || '')
      })).filter(i => i.name),
      steps: (Array.isArray(r.steps) ? r.steps : []).map(s => String(s || '').trim()).filter(Boolean),
      notes: String(r.notes || '')
    }));
  if(result.length === 0) throw new Error('keine Rezepte erkannt');
  return result;
}
