// Kleine Hilfsfunktionen ohne Abhängigkeiten.

export function uid(){ return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }

export function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
