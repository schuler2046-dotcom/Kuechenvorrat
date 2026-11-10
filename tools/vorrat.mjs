// Werkzeug fÃ¼r Claude: liest und schreibt die Daten des Haushalts direkt in Firestore.
// Aufruf: node tools/vorrat.mjs <befehl> [argumente] [--haushalt <code>]
// Haushalt: --haushalt, sonst Umgebungsvariable VORRAT_HAUSHALT, sonst Datei tools/haushalt.txt.
// Vor jedem Schreiben wird der ganze Haushalt nach backups/<zeitstempel>/ gesichert.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { connect } from './firestore-node.mjs';
import { makeBatch } from '../ig-import.js';
import {
  normalizeAll, addRecipes, patchRecipe, removeRecipe, findRecipes,
  openInbox, markInbox, backupsToDelete, backupName
} from './vorrat-core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = 'https://schuler2046-dotcom.github.io/Kuechenvorrat/';

function parseArgs(argv){
  const pos = [], opt = {};
  for(let i = 0; i < argv.length; i++){
    const a = argv[i];
    if(a.startsWith('--')) opt[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else pos.push(a);
  }
  return { cmd: pos[0], pos: pos.slice(1), opt };
}

function household(opt){
  const code = opt.haushalt || process.env.VORRAT_HAUSHALT
    || (existsSync(join(ROOT, 'tools', 'haushalt.txt')) ? readFileSync(join(ROOT, 'tools', 'haushalt.txt'), 'utf8').trim() : '');
  if(!code || code === true) throw new Error('Kein Haushalt: tools/haushalt.txt anlegen oder --haushalt angeben.');
  return code;
}

function readInput(src){
  const text = src === '-' ? readFileSync(0, 'utf8') : readFileSync(src, 'utf8');
  return text.replace(/^﻿/, '');
}

// Bild als Data-URL: aus Datei oder URL, verkleinert Ã¼ber tools/bild.py.
async function imageData(opt){
  let file = opt.bild;
  let tmp = null;
  if(opt['bild-url']){
    const res = await fetch(opt['bild-url']);
    if(!res.ok) throw new Error('Bild nicht ladbar: HTTP ' + res.status);
    tmp = mkdtempSync(join(tmpdir(), 'vorrat-bild-'));
    file = join(tmp, 'bild.jpg');
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  if(!file || file === true) return null;
  try{
    const r = spawnSync('python', ['-I', join(ROOT, 'tools', 'bild.py'), file], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    if(r.status !== 0) throw new Error('bild.py fehlgeschlagen: ' + (r.stderr || '').trim().split('\n').pop());
    return r.stdout.trim();
  } finally {
    if(tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

async function backup(db){
  const dump = await db.dumpAll();
  const dir = join(ROOT, 'backups', backupName());
  mkdirSync(dir, { recursive: true });
  for(const [key, d] of Object.entries(dump)) writeFileSync(join(dir, key + '.json'), JSON.stringify(d));
  const root = join(ROOT, 'backups');
  for(const old of backupsToDelete(readdirSync(root))) rmSync(join(root, old), { recursive: true, force: true });
  console.error(`Sicherung: backups/${dir.split(/[\\/]/).pop()} (${Object.keys(dump).length} Dokumente)`);
}

async function writeRecipes(db, items){
  let result;
  await db.mutate('recipes', [], cur => {
    result = addRecipes(cur, items);
    return result.recipes;
  });
  if(!result.added.length && !result.imagesAdded){
    console.log(`Nichts Neues: ${result.skipped} schon vorhanden.`);
    return result;
  }
  for(const img of result.images) await db.write('img-' + img.id, { dataUrl: img.imageData });
  if(result.added.length){
    await db.mutate('meta', {}, m => {
      return { ...m, igBatches: [makeBatch(result.added), ...(m.igBatches || [])].slice(0, 5) };
    });
  }
  return result;
}

const commands = {
  async status(db){
    const [rec, inv, inbox] = await Promise.all([db.read('recipes', []), db.read('inventory', []), db.read('inbox', [])]);
    const size = JSON.stringify(rec).length;
    console.log(`Haushalt: ${rec.length} Rezepte (${Math.round(size / 1024)} KB von 1024 KB), `
      + `${inv.length} Vorratsartikel, ${openInbox(inbox).length} offene Links.`);
  },

  async 'rezept-neu'(db, { pos, opt }){
    const raw = JSON.parse(readInput(pos[0] || '-'));
    const list = Array.isArray(raw) ? raw : (raw.recipes || [raw]);
    const items = normalizeAll(list, await imageData(opt));
    if(!items.length) throw new Error('Kein Rezept mit Namen gefunden.');
    await backup(db);
    const r = await writeRecipes(db, items);
    for(const rec of r.added) console.log(`NEU ${rec.id} â€“ ${rec.name}\n  ${LIVE}#/rezept/${encodeURIComponent(rec.id)}`);
    if(r.skipped) console.log(`${r.skipped} Ã¼bersprungen (Doppelung).`);
    if(r.imagesAdded) console.log(`${r.imagesAdded} Bild(er) nachgetragen.`);
  },

  async rezept(db, { pos }){
    const hits = findRecipes(await db.read('recipes', []), pos.join(' '));
    for(const r of hits) console.log(JSON.stringify(r));
    if(!hits.length) console.log('Kein Treffer.');
  },

  async 'rezept-aendern'(db, { pos }){
    const patch = JSON.parse(readInput(pos[1] || '-'));
    await backup(db);
    await db.mutate('recipes', [], cur => patchRecipe(cur, pos[0], patch));
    console.log('GeÃ¤ndert: ' + pos[0]);
  },

  async 'rezept-loeschen'(db, { pos }){
    await backup(db);
    await db.mutate('recipes', [], cur => removeRecipe(cur, pos[0]));
    await db.remove('img-' + pos[0]);
    console.log('GelÃ¶scht: ' + pos[0] + ' (Sicherung liegt unter backups/)');
  },

  async lesen(db, { pos }){
    const { value, stamp } = await db.readWithStamp(pos[0], null);
    console.error('stand=' + stamp);
    console.log(JSON.stringify(value));
  },

  async schreiben(db, { pos, opt }){
    const value = JSON.parse(readInput(pos[1] || '-'));
    await backup(db);
    const expect = opt.stand ? Number(opt.stand) : null;
    await db.mutate(pos[0], null, () => value, expect);
    console.log('Geschrieben: ' + pos[0]);
  },

  async eingang(db){
    for(const e of openInbox(await db.read('inbox', []))) console.log(JSON.stringify(e));
  },

  async 'eingang-erledigt'(db, { pos }){
    await db.mutate('inbox', [], cur => markInbox(cur, pos[0], { status: 'erledigt', recipeId: pos[1] || undefined, doneAt: new Date().toISOString() }));
    console.log('Erledigt: ' + pos[0]);
  },

  async 'eingang-fehler'(db, { pos }){
    await db.mutate('inbox', [], cur => markInbox(cur, pos[0], { status: 'fehler', meldung: pos.slice(1).join(' ') }));
    console.log('Als Fehler markiert: ' + pos[0]);
  },

  // Einmalige Ãœbernahme aus dem Sync-Ordner (data/recipes.json + data/images/<id>.jpg).
  async 'ordner-einspielen'(db, { pos, opt }){
    const dir = resolve(pos[0]);
    const src = JSON.parse(readFileSync(join(dir, 'data', 'recipes.json'), 'utf8'));
    const items = [];
    for(const raw of src.recipes || []){
      if(raw.demo) continue;
      const rid = String(raw.id || raw.igId || '');
      let data = null;
      for(const ext of ['.jpg', '.jpeg', '.png', '.webp']){
        const f = join(dir, 'data', 'images', rid + ext);
        if(existsSync(f)){ data = await imageData({ bild: f }); break; }
      }
      items.push(...normalizeAll([data ? { ...raw, imageData: data } : raw]));
    }
    console.log(`${items.length} Rezepte im Ordner gelesen.`);
    if(opt.trocken){
      const cur = await db.read('recipes', []);
      const r = addRecipes(cur, items);
      console.log(`Trockenlauf: ${r.added.length} neu, ${r.skipped} vorhanden, ${r.imagesAdded} Bilder wÃ¼rden ergÃ¤nzt.`);
      return;
    }
    await backup(db);
    const r = await writeRecipes(db, items);
    console.log(`${r.added.length} neu, ${r.skipped} vorhanden, ${r.imagesAdded} Bilder ergÃ¤nzt.`);
  }
};

const args = parseArgs(process.argv.slice(2));
try{
  if(!commands[args.cmd]){
    console.error('Befehle: ' + Object.keys(commands).join(', '));
    process.exit(2);
  }
  const db = await connect(household(args.opt), join(ROOT, 'firebase-config.js'));
  await commands[args.cmd](db, args);
  process.exit(0);
}catch(e){
  console.error('Fehler: ' + e.message);
  process.exit(1);
}
