import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAll, addRecipes, patchRecipe, removeRecipe, findRecipes,
  openInbox, markInbox, backupsToDelete, backupName
} from '../tools/vorrat-core.mjs';

const raw = (igId, title, extra = {}) => ({
  igId, title, category: 'deftig',
  ingredients: [{ name: 'Mehl', amount: '200', unit: 'g' }], steps: ['Mischen'], ...extra
});

test('Werkzeug: neues Rezept wird mit Bild angehängt', () => {
  const items = normalizeAll([raw('A1', 'Pfannkuchen')], 'data:image/jpeg;base64,xx');
  const r = addRecipes([], items);
  assert.equal(r.added.length, 1);
  assert.equal(r.added[0].id, 'ig-A1');
  assert.equal(r.added[0].hasImage, true);
  assert.deepEqual(r.images, [{ id: 'ig-A1', imageData: 'data:image/jpeg;base64,xx' }]);
});

test('Werkzeug: zweites Einspielen derselben Rezepte erzeugt keine Doppelung', () => {
  const items = normalizeAll([raw('A1', 'Pfannkuchen')]);
  const first = addRecipes([], items);
  const second = addRecipes(first.recipes, items);
  assert.equal(second.added.length, 0);
  assert.equal(second.skipped, 1);
  assert.equal(second.recipes.length, 1);
});

test('Werkzeug: gleicher Name mit anderer ID gilt als Doppelung', () => {
  const first = addRecipes([], normalizeAll([raw('A1', 'Pfannkuchen')]));
  const second = addRecipes(first.recipes, normalizeAll([raw('B2', ' pfannkuchen ')]));
  assert.equal(second.added.length, 0);
});

test('Werkzeug: fehlendes Bild bei vorhandenem Rezept wird nachgetragen', () => {
  const first = addRecipes([], normalizeAll([raw('A1', 'Pfannkuchen')]));
  const again = addRecipes(first.recipes, normalizeAll([raw('A1', 'Pfannkuchen', { imageData: 'data:x' })]));
  assert.equal(again.imagesAdded, 1);
  assert.equal(again.recipes[0].hasImage, true);
  assert.equal(again.recipes.length, 1);
});

test('Werkzeug: Einträge ohne Namen werden verworfen', () => {
  assert.equal(normalizeAll([{ igId: 'X', ingredients: [] }]).length, 0);
});

test('Werkzeug: Ändern setzt editedAt und schützt die ID', () => {
  const list = [{ id: 'a', name: 'Alt' }, { id: 'b', name: 'Bleibt' }];
  const out = patchRecipe(list, 'a', { name: 'Neu' }, 'T');
  assert.deepEqual(out[0], { id: 'a', name: 'Neu', editedAt: 'T' });
  assert.deepEqual(out[1], list[1]);
  assert.throws(() => patchRecipe(list, 'a', { id: 'x' }));
  assert.throws(() => patchRecipe(list, 'zz', { name: 'x' }));
});

test('Werkzeug: Löschen und Suchen', () => {
  const list = [{ id: 'a', name: 'Linsen-Curry' }, { id: 'b', name: 'Kuchen' }];
  assert.deepEqual(removeRecipe(list, 'a'), [list[1]]);
  assert.throws(() => removeRecipe(list, 'zz'));
  assert.deepEqual(findRecipes(list, 'curry'), [list[0]]);
  assert.deepEqual(findRecipes(list, 'b'), [list[1]]);
  assert.deepEqual(findRecipes(list, ''), []);
});

test('Warteliste: offene Einträge und Statuswechsel', () => {
  const inbox = [{ id: '1', status: 'offen' }, { id: '2', status: 'erledigt' }];
  assert.deepEqual(openInbox(inbox).map(e => e.id), ['1']);
  const out = markInbox(inbox, '1', { status: 'erledigt', recipeId: 'ig-A1' });
  assert.equal(out[0].recipeId, 'ig-A1');
  assert.equal(inbox[0].status, 'offen');
  assert.throws(() => markInbox(inbox, 'nope', {}));
  assert.deepEqual(openInbox(null), []);
});

test('Sicherungen: die neuesten 20 bleiben, ältere werden gelöscht', () => {
  const names = Array.from({ length: 23 }, (_, i) => backupName(new Date(Date.UTC(2026, 10, 1, 0, i))));
  const del = backupsToDelete(names, 20);
  assert.equal(del.length, 3);
  assert.deepEqual(del.sort(), names.slice(0, 3).sort());
  assert.deepEqual(backupsToDelete(names.slice(0, 5), 20), []);
});
