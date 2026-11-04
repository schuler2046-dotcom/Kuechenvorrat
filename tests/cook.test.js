import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDeduction, defaultOn, applyDeduction, revertDeduction } from '../cook.js';

const inv = (...items) => items.map((x, i) => ({ id: 'i' + i, ...x }));
const recipe = (...ingredients) => ({ name: 'Test', ingredients });
const kinds = rows => rows.map(r => r.kind);
const picksOf = rows => rows.flatMap(r => r.picks || []);

test('250 g Mehl aus 2 Packungen à 1 kg: 1,75 Packungen bleiben', () => {
  const stock = inv({ name: 'Mehl', amount: '2', unit: 'Packung', packSize: 1000, packUnit: 'g' });
  const rows = planDeduction(recipe({ name: 'Mehl', amount: '250', unit: 'g' }), stock);
  assert.deepEqual(kinds(rows), ['deduct']);
  assert.equal(rows[0].picks[0].take, 250);
  assert.equal(rows[0].picks[0].after, 1.75);
  assert.ok(defaultOn(rows[0]));
  const res = applyDeduction(stock, picksOf(rows));
  assert.equal(res.inventory[0].amount, 1.75);
  assert.equal(res.undo[0].amount, '2');
});

test('Portionen skalieren die Abbuchung', () => {
  const stock = inv({ name: 'Nudeln', amount: '500', unit: 'g' });
  const rows = planDeduction(recipe({ name: 'Nudeln', amount: '200', unit: 'g' }), stock, {}, 2);
  assert.equal(rows[0].picks[0].take, 400);
  assert.equal(applyDeduction(stock, picksOf(rows)).inventory[0].amount, 100);
});

test('Mehrere Artikel werden nacheinander verbraucht, Artikel ohne Rest entfallen', () => {
  const stock = inv({ name: 'Mehl', amount: '300', unit: 'g' }, { name: 'Mehl', amount: '500', unit: 'g' });
  const rows = planDeduction(recipe({ name: 'Mehl', amount: '600', unit: 'g' }), stock);
  assert.deepEqual(rows[0].picks.map(p => p.take), [300, 300]);
  const res = applyDeduction(stock, picksOf(rows));
  assert.equal(res.inventory.length, 1);
  assert.equal(res.inventory[0].id, 'i1');
  assert.equal(res.inventory[0].amount, 200);
});

test('Zu wenig im Vorrat: nie unter 0, Fehlmenge wird gemeldet', () => {
  const stock = inv({ name: 'Reis', amount: '150', unit: 'g' });
  const rows = planDeduction(recipe({ name: 'Reis', amount: '200', unit: 'g' }), stock);
  assert.equal(rows[0].short, 50);
  const res = applyDeduction(stock, picksOf(rows));
  assert.equal(res.inventory.length, 0);
});

test('Grundvorrat, fehlend, ohne Menge, nicht umrechenbar', () => {
  const stock = inv({ name: 'Spaghetti', amount: '1', unit: 'Packung' }, { name: 'Koriander', amount: '1', unit: 'Bund' });
  const rows = planDeduction(recipe(
    { name: 'Salz', amount: '1', unit: 'TL' },
    { name: 'Butter', amount: '50', unit: 'g' },
    { name: 'Koriander' },
    { name: 'Spaghetti', amount: '500', unit: 'g' }
  ), stock);
  assert.deepEqual(kinds(rows), ['staple', 'missing', 'unknown', 'unconvertible']);
  assert.ok(!defaultOn(rows[3]));
});

test('Kleinmengen und Gewürze sind standardmäßig abgewählt', () => {
  const stock = inv(
    { name: 'Backpulver', amount: '3', unit: 'Päckchen' },
    { name: 'Paprikapulver', amount: '1', unit: 'Glas', category: 'Gewürze & Saucen' }
  );
  const rows = planDeduction(recipe(
    { name: 'Backpulver', amount: '15', unit: 'g' },
    { name: 'Paprikapulver', amount: '50', unit: 'g' }
  ), stock);
  assert.ok(!defaultOn(rows[0]));
  assert.ok(!defaultOn(rows[1]));
});

test('Stückzahlen: Eier', () => {
  const stock = inv({ name: 'Eier', amount: '6', unit: '' });
  const rows = planDeduction(recipe({ name: 'Ei', amount: '2', unit: 'stk' }), stock);
  assert.equal(applyDeduction(stock, picksOf(rows)).inventory[0].amount, 4);
});

test('Ersatzartikel wird abgebucht (Rapsöl statt Olivenöl)', () => {
  const stock = inv({ name: 'Rapsöl', amount: '500', unit: 'ml' });
  const rows = planDeduction(recipe({ name: 'Olivenöl', amount: '100', unit: 'ml' }), stock);
  assert.equal(rows[0].kind, 'deduct');
  assert.equal(rows[0].substitute, true);
  assert.equal(rows[0].picks[0].name, 'Rapsöl');
});

test('Rückgängig stellt Mengen und entfernte Artikel wieder her', () => {
  const stock = inv({ name: 'Mehl', amount: '300', unit: 'g' }, { name: 'Zucker', amount: '1', unit: 'kg' });
  const rows = planDeduction(recipe({ name: 'Mehl', amount: '300', unit: 'g' }, { name: 'Zucker', amount: '200', unit: 'g' }), stock);
  const res = applyDeduction(stock, picksOf(rows));
  assert.equal(res.inventory.length, 1);
  const back = revertDeduction(res.inventory, res.undo);
  assert.equal(back.length, 2);
  assert.equal(back.find(i => i.name === 'Mehl').amount, '300');
  assert.equal(back.find(i => i.name === 'Zucker').amount, '1');
});

test('Veränderter Vorrat zwischen Plan und Abbuchung: unbekannte Artikel werden ignoriert', () => {
  const stock = inv({ name: 'Mehl', amount: '500', unit: 'g' });
  const rows = planDeduction(recipe({ name: 'Mehl', amount: '200', unit: 'g' }), stock);
  const res = applyDeduction([], picksOf(rows));
  assert.equal(res.inventory.length, 0);
  assert.equal(res.undo.length, 0);
});
