// Datenschicht der Küchenvorrat-App.
//
// Zwei Betriebsarten:
//  - 'firebase': Firestore mit Echtzeit-Sync (onSnapshot) und Offline-Persistenz.
//  - 'lokal':    localStorage-Fallback, solange firebase-config.js noch leer ist
//                oder Firebase nicht geladen werden kann. Kein Sync zwischen Geräten.
//
// Harte Regel: Dokument- und Feldnamen ändern sich nie, Schema-Änderungen nur additiv.
// Jeder Datensatz liegt als JSON-String im Feld `json` eines Firestore-Dokuments
// unter households/{haushaltsCode}/data/{key} — dadurch ist das Schema der Nutzdaten
// vollständig von Firestore entkoppelt und bleibt identisch zum bisherigen Artifact.

export const DATA_KEYS = ['inventory', 'recipes', 'weekplan', 'shopping', 'meta'];

const LOCAL_PREFIX = 'vorrat-';

let mode = 'lokal';
let F = null;          // Firestore-Modul
let db = null;
let householdCode = null;
let changeCb = null;
let statusCb = null;

export function storeMode(){ return mode; }

function docRef(key){
  return F.doc(db, 'households', householdCode, 'data', key);
}

function readLocal(key, fallback){
  try{
    const raw = localStorage.getItem(LOCAL_PREFIX + key);
    if(raw !== null) return JSON.parse(raw);
  }catch(e){ /* defekter Eintrag -> fallback */ }
  return fallback;
}

function emitLocalAll(){
  for(const key of DATA_KEYS){
    changeCb && changeCb(key, readLocal(key, null), { fromCache: false });
  }
}

// Initialisiert die Datenschicht. onChange(key, valueOrNull, meta) wird bei jeder
// Änderung gerufen (auch initial für jeden Key). Rückgabe: aktiver Modus.
export async function initStore(code, onChange, onStatus){
  changeCb = onChange;
  statusCb = onStatus;
  householdCode = code;

  const cfg = window.FIREBASE_CONFIG;
  if(cfg && cfg.apiKey){
    try{
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
      const fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
      const app = initializeApp(cfg);
      db = fs.initializeFirestore(app, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
      });
      await signInAnonymously(getAuth(app));
      F = fs;
      mode = 'firebase';
      for(const key of DATA_KEYS){
        fs.onSnapshot(docRef(key), snap => {
          const d = snap.data();
          let value = null;
          if(d && typeof d.json === 'string'){
            try{ value = JSON.parse(d.json); }catch(e){ value = null; }
          }
          changeCb && changeCb(key, value, { fromCache: snap.metadata.fromCache });
        }, err => {
          statusCb && statusCb('Sync-Fehler: ' + (err.code || err.message));
        });
      }
      return mode;
    }catch(e){
      console.error('Firebase-Initialisierung fehlgeschlagen', e);
      mode = 'lokal';
      statusCb && statusCb('Firebase nicht erreichbar – lokaler Modus ohne Sync.');
    }
  }
  emitLocalAll();
  return mode;
}

// Read-before-write: liest den aktuellen Stand, wendet mutator an, speichert.
// Im Firebase-Modus als Transaktion (nebenläufigkeitssicher). Offline oder bei
// Transaktionsfehler wird auf ein direktes Schreiben des mutierten letzten
// bekannten Standes (fallback) zurückgegriffen, damit Änderungen nicht verloren gehen.
export async function mutate(key, fallback, mutator){
  if(mode === 'firebase'){
    try{
      return await F.runTransaction(db, async t => {
        const snap = await t.get(docRef(key));
        let cur = fallback;
        const d = snap.data();
        if(d && typeof d.json === 'string'){
          try{ cur = JSON.parse(d.json); }catch(e){ /* fallback behalten */ }
        }
        const upd = mutator(cur);
        t.set(docRef(key), { json: JSON.stringify(upd), updatedAt: F.serverTimestamp() });
        return upd;
      });
    }catch(e){
      // Offline: Transaktionen brauchen Verbindung -> direktes (gequeutes) Schreiben.
      const upd = mutator(fallback);
      try{
        F.setDoc(docRef(key), { json: JSON.stringify(upd), updatedAt: F.serverTimestamp() });
      }catch(e2){
        statusCb && statusCb('Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.');
        throw e2;
      }
      return upd;
    }
  }
  const cur = readLocal(key, fallback);
  const upd = mutator(cur);
  localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(upd));
  changeCb && changeCb(key, upd, { fromCache: false });
  return upd;
}
