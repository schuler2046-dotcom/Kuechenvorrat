// Warteliste für Rezept-Links (Dokument "inbox") – reine Funktionen ohne DOM.
// Die App merkt sich Instagram-Links, Claude arbeitet sie ab (tools/vorrat.mjs, Befehl "eingang").
// Eintrag: { id, url, shortcode, addedAt, status: 'offen'|'erledigt'|'fehler', recipeId?, meldung?, doneAt? }

const IG_URL = /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;

// Erkennt einen Instagram-Beitragslink im eingefügten Text. Rückgabe: { url, shortcode } oder null.
export function parseInstagramUrl(text){
  const m = IG_URL.exec(String(text || ''));
  if(!m) return null;
  return { url: 'https://www.instagram.com/p/' + m[1] + '/', shortcode: m[1] };
}

// Link vormerken. status: 'neu' (angelegt), 'doppelt' (steht schon in der Warteliste),
// 'vorhanden' (als Rezept schon da, recipeId gesetzt), 'ungueltig' (kein Instagram-Link).
export function addInboxLink(inbox, recipes, text, newId, now = new Date().toISOString()){
  const list = inbox || [];
  const p = parseInstagramUrl(text);
  if(!p) return { inbox: list, status: 'ungueltig' };
  const rec = (recipes || []).find(r => r.igId === p.shortcode);
  if(rec) return { inbox: list, status: 'vorhanden', recipeId: rec.id };
  if(list.some(e => e.shortcode === p.shortcode && e.status !== 'erledigt')) return { inbox: list, status: 'doppelt' };
  const entry = { id: newId(), url: p.url, shortcode: p.shortcode, addedAt: now, status: 'offen' };
  return { inbox: [...list, entry], status: 'neu' };
}

export function removeInboxEntry(inbox, id){
  return (inbox || []).filter(e => e.id !== id);
}

// Was die Rezeptseite zeigt: alles Offene und Fehlerhafte, dazu die letzten erledigten.
export function visibleInbox(inbox, doneShown = 3){
  const list = inbox || [];
  const open = list.filter(e => e.status !== 'erledigt');
  const done = list.filter(e => e.status === 'erledigt').slice(-doneShown).reverse();
  return [...open, ...done];
}
