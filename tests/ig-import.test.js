import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImportFile, normalizeIgRecipe, pickNew } from '../ig-import.js';

const raw = {
  id: 'DecETEMs4tK',
  sourceUrl: 'https://www.instagram.com/rezeptu_xju/reel/DecETEMs4tK/',
  author: 'rezeptu_xju',
  title: 'Cremiges Linsen-Curry',
  category: 'deftig',
  servings: 4,
  time: '',
  status: 'pruefen',
  ingredients: [
    { amount: 150, unit: 'g', name: 'rote Linsen' },
    { amount: 1, unit: 'stk', name: 'Zwiebel' },
    { amount: 10, unit: 'ml', name: 'Ingwer', approx: true, note: '2 TL, gerieben' },
    { amount: null, unit: '', name: 'Salz und Pfeffer', note: 'nach Geschmack' }
  ],
  steps: ['Zwiebel anbraten.', '  ', 'Köcheln.']
};

test('Sync-Eintrag wird zu einem Vorratsapp-Rezept', () => {
  const { recipe, imageData } = normalizeIgRecipe(raw, '2026-11-04T00:00:00Z');
  assert.equal(imageData, null);
  assert.equal(recipe.id, 'ig-DecETEMs4tK');
  assert.equal(recipe.igId, 'DecETEMs4tK');
  assert.equal(recipe.name, 'Cremiges Linsen-Curry');
  assert.equal(recipe.source, 'instagram');
  assert.equal(recipe.servings, 4);
  assert.equal(recipe.zeit, undefined);
  assert.equal(recipe.status, 'pruefen');
  assert.equal(recipe.hasImage, false);
  assert.deepEqual(recipe.steps, ['Zwiebel anbraten.', 'Köcheln.']);
  assert.deepEqual(recipe.ingredients[0], { name: 'rote Linsen', amount: '150', unit: 'g' });
  assert.deepEqual(recipe.ingredients[1], { name: 'Zwiebel', amount: '1', unit: 'stk' });
  assert.deepEqual(recipe.ingredients[2], { name: 'Ingwer', amount: '10', unit: 'ml', note: '2 TL, gerieben', approx: true });
  assert.deepEqual(recipe.ingredients[3], { name: 'Salz und Pfeffer', amount: '', unit: '', note: 'nach Geschmack' });
});

test('Bild wird getrennt zurückgegeben, ohne Namen kein Rezept', () => {
  const withImg = normalizeIgRecipe({ ...raw, imageData: 'data:image/jpeg;base64,AAAA' });
  assert.equal(withImg.imageData, 'data:image/jpeg;base64,AAAA');
  assert.equal(withImg.recipe.hasImage, true);
  assert.ok(!('imageData' in withImg.recipe));
  assert.equal(normalizeIgRecipe({ ingredients: [] }), null);
});

test('Fehlender Status wird aus dem Inhalt abgeleitet', () => {
  assert.equal(normalizeIgRecipe({ title: 'A', ingredients: [], steps: [] }).recipe.status, 'unvollstaendig');
  assert.equal(normalizeIgRecipe({ title: 'A', ingredients: [{ name: 'x', amount: 1, unit: 'g' }], steps: ['y'] }).recipe.status, 'ok');
});

test('Nur neue Rezepte werden übernommen, Wiederholung ändert nichts', () => {
  const a = normalizeIgRecipe(raw);
  const b = normalizeIgRecipe({ title: 'Anderes', id: 'XYZ' });
  const manual = normalizeIgRecipe({ title: 'Eigenes Rezept' });
  const existing = [{ id: 'ig-DecETEMs4tK', igId: 'DecETEMs4tK', name: 'Cremiges Linsen-Curry (bearbeitet)' }, { id: 'm1', name: 'Eigenes Rezept' }];
  const res = pickNew(existing, [a, b, manual]);
  assert.equal(res.add.length, 1);
  assert.equal(res.add[0].recipe.igId, 'XYZ');
  assert.equal(res.skipped, 2);
  const again = pickNew([...existing, res.add[0].recipe], [a, b, manual]);
  assert.equal(again.add.length, 0);
});

test('Datei mit Liste oder Objekt einlesen', () => {
  assert.equal(parseImportFile(JSON.stringify({ recipes: [raw] })).length, 1);
  assert.equal(parseImportFile(JSON.stringify([raw, raw])).length, 2);
  assert.throws(() => parseImportFile('{"x":1}'));
});

import { makeBatch, nextBatch, planUndo, applyUndo, markUsed } from '../ig-import.js';

test('Rückgängig: nur unbearbeitete Instagram-Rezepte der Charge werden gelöscht', () => {
  const recipes = [
    { id: 'ig-A', source: 'instagram', name: 'A' },
    { id: 'ig-B', source: 'instagram', name: 'B', editedAt: '2026-11-05T10:00:00Z' },
    { id: 'ig-C', source: 'instagram', name: 'C' },
    { id: 'm1', source: 'manuell', name: 'Eigenes' }
  ];
  const batch = makeBatch([{ id: 'ig-A' }, { id: 'ig-B' }, { id: 'ig-GONE' }, { id: 'm1' }], '2026-11-04T12:00:00Z');
  const plan = planUndo(batch, recipes);
  assert.deepEqual(plan.remove, ['ig-A']);
  assert.deepEqual(plan.edited, ['ig-B', 'm1']);
  assert.deepEqual(plan.gone, ['ig-GONE']);
  const left = applyUndo(recipes, plan);
  assert.deepEqual(left.map(r => r.id), ['ig-B', 'ig-C', 'm1']);
});

test('Rückgängig: eine Charge nur einmal, danach verbraucht', () => {
  const b1 = makeBatch([{ id: 'ig-1' }], '2026-11-04T12:00:00Z');
  const b2 = makeBatch([{ id: 'ig-2' }], '2026-12-01T12:00:00Z');
  let batches = [b2, b1];
  assert.equal(nextBatch(batches).id, b2.id);
  batches = markUsed(batches, b2.id, '2026-12-02T00:00:00Z');
  assert.equal(batches[0].used, true);
  assert.equal(nextBatch(batches).id, b1.id);
  assert.equal(nextBatch(markUsed(batches, b1.id)), null);
  assert.equal(nextBatch([]), null);
  assert.equal(nextBatch(undefined), null);
});

test('Rückgängig zweimal auf derselben Liste löscht nichts Weiteres', () => {
  const recipes = [{ id: 'ig-A', source: 'instagram', name: 'A' }];
  const batch = makeBatch(recipes);
  const once = applyUndo(recipes, planUndo(batch, recipes));
  assert.equal(once.length, 0);
  const plan2 = planUndo(batch, once);
  assert.deepEqual(plan2.remove, []);
  assert.deepEqual(plan2.gone, ['ig-A']);
});
