// Firestore-Zugriff für das Werkzeug – gleiches Dokumentformat wie store.js:
// households/{haushalt}/data/{key} = { json: "<String>", updatedAt }.
// Meldet sich anonym an, wie die App (Regeln: angemeldet = Zugriff, der Haushalts-Code ist das Geheimnis).

import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, getDocs, collection, runTransaction, serverTimestamp
} from 'firebase/firestore';

// firebase-config.js ist ein Browser-Skript (window.FIREBASE_CONFIG = {...}); hier nur ausgelesen.
function loadConfig(path){
  const src = readFileSync(path, 'utf8');
  const win = {};
  new Function('window', src)(win);
  if(!win.FIREBASE_CONFIG || !win.FIREBASE_CONFIG.apiKey) throw new Error('firebase-config.js ohne apiKey');
  return win.FIREBASE_CONFIG;
}

export async function connect(household, configPath){
  const app = initializeApp(loadConfig(configPath));
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const ref = (key) => doc(db, 'households', household, 'data', key);
  const parse = (snap) => {
    const d = snap.data();
    if(d && typeof d.json === 'string'){
      try{ return JSON.parse(d.json); }catch(e){ return null; }
    }
    return null;
  };
  const stamp = (snap) => {
    const d = snap.data();
    return d && d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : 0;
  };

  return {
    household,
    async read(key, fallback = null){
      const snap = await getDoc(ref(key));
      const v = parse(snap);
      return v === null ? fallback : v;
    },
    async readWithStamp(key, fallback = null){
      const snap = await getDoc(ref(key));
      const v = parse(snap);
      return { value: v === null ? fallback : v, stamp: stamp(snap) };
    },
    async write(key, value){
      await setDoc(ref(key), { json: JSON.stringify(value), updatedAt: serverTimestamp() });
    },
    async remove(key){
      await deleteDoc(ref(key));
    },
    // Read-before-write in einer Transaktion. expectStamp (optional): bricht ab, wenn das Dokument
    // inzwischen von jemand anderem geändert wurde.
    async mutate(key, fallback, mutator, expectStamp = null){
      return runTransaction(db, async t => {
        const snap = await t.get(ref(key));
        if(expectStamp !== null && stamp(snap) !== expectStamp){
          throw new Error(`"${key}" wurde zwischenzeitlich geändert – bitte neu lesen.`);
        }
        const cur = parse(snap);
        const upd = mutator(cur === null ? fallback : cur);
        t.set(ref(key), { json: JSON.stringify(upd), updatedAt: serverTimestamp() });
        return upd;
      });
    },
    // Alle Dokumente des Haushalts als { key: rohes Dokument } (für Sicherungen).
    async dumpAll(){
      const snaps = await getDocs(collection(db, 'households', household, 'data'));
      const out = {};
      snaps.forEach(s => { out[s.id] = { json: (s.data() || {}).json ?? null }; });
      return out;
    }
  };
}
