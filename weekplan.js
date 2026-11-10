// Wochenplan-Hilfen – reine Funktionen ohne DOM.

// Tauscht die Gerichte zweier Wochentage. Ist einer der Tage frei, zieht das Gericht dorthin um.
// Gibt immer ein neues Objekt zurück, das Original bleibt unverändert.
export function swapDays(weekplan, a, b){
  const out = { ...weekplan };
  if(a === b) return out;
  const ra = out[a];
  const rb = out[b];
  if(rb) out[a] = rb; else delete out[a];
  if(ra) out[b] = ra; else delete out[b];
  return out;
}
