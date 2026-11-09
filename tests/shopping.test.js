import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRecipe } from '../matching.js';
import { needFor, mergeNeeds, needsOfEvaluation, reconcilePlanNeeds } from '../shopping.js';

const inv = (...items) => items.map((x, i) => ({ id: 'i' + i, ...x }));

test('Fehlende Zutat: metrische Menge, Portionen skaliert', () => {
  const ev = evaluateRecipe({ ingredients: [{ name: 'Olivenöl', amount: '2', unit: 'EL' }, { name: 'Zwiebel', amount: '1', unit: '' }] }, [], {}, 2);
  assert.deepEqual(needsOfEvaluation(ev, 2), [
    { name: 'Olivenöl', amount: '60', unit: 'ml' },
    { name: 'Zwiebel', amount: '2', unit: '' }
  ]);
});

test('Knappe Zutat: Fehlmenge, bei Packungsgröße in ganzen Packungen', () => {
  const plain = evaluateRecipe({ ingredients: [{ name: 'Mehl', amount: '600', unit: 'g' }] }, inv({ name: 'Mehl', amount: '450', unit: 'g' }));
  assert.deepEqual(needsOfEvaluation(plain), [{ name: 'Mehl', amount: '150', unit: 'g' }]);
  const packs = evaluateRecipe({ ingredients: [{ name: 'Mehl', amount: '1200', unit: 'g' }] }, inv({ name: 'Mehl', amount: '1', unit: 'Packung', packSize: 1000, packUnit: 'g' }));
  assert.deepEqual(needsOfEvaluation(packs), [{ name: 'Mehl', amount: '1', unit: 'Packung' }]);
});

test('Ohne Menge bleibt der Eintrag ohne Menge', () => {
  const ev = evaluateRecipe({ ingredients: [{ name: 'Limettensaft' }] }, []);
  assert.deepEqual(needsOfEvaluation(ev), [{ name: 'Limettensaft', amount: '', unit: '' }]);
});

test('Zusammenführen über mehrere Rezepte', () => {
  const merged = mergeNeeds([
    { name: 'Zwiebel', amount: '1', unit: '' },
    { name: 'Zwiebeln', amount: '2', unit: '' },
    { name: 'Milch', amount: '500', unit: 'ml' },
    { name: 'Milch', amount: '1', unit: 'l' },
    { name: 'Mehl', amount: '200', unit: 'g' },
    { name: 'Mehl', amount: '1', unit: 'Packung' },
    { name: 'Salz', amount: '', unit: '' }
  ]);
  assert.deepEqual(merged, [
    { name: 'Zwiebel', amount: '3', unit: '' },
    { name: 'Milch', amount: '1500', unit: 'ml' },
    { name: 'Mehl', amount: '200', unit: 'g' },
    { name: 'Mehl', amount: '1', unit: 'Packung' },
    { name: 'Salz', amount: '', unit: '' }
  ]);
});

test('needFor mit knapper Zutat ohne passende Packungsgröße', () => {
  const row = { ing: { name: 'Spaghetti' }, status: 'knapp', dim: 'mass', short: 250, items: [{ unit: 'Packung' }] };
  assert.deepEqual(needFor(row), { name: 'Spaghetti', amount: '250', unit: 'g' });
});

const mkId = (() => { let n = 0; return () => 'new' + (++n); })();
const need = (name, amount = '', unit = '') => ({ name, amount, unit });

test('Plan-Abgleich: fehlende Zutaten werden angelegt', () => {
  const r = reconcilePlanNeeds([], [need('Mehl', '200', 'g'), need('Salz')], mkId);
  assert.equal(r.changed, true);
  assert.deepEqual(r.list.map(s => [s.name, s.amount, s.unit, s.source, s.checked]), [
    ['Mehl', '200', 'g', 'plan', false],
    ['Salz', '', '', 'plan', false]
  ]);
});

test('Plan-Abgleich: nichts zu tun meldet keine Änderung', () => {
  const list = [{ id: 'a', name: 'Mehl', amount: '200', unit: 'g', checked: false, source: 'plan' }];
  const r = reconcilePlanNeeds(list, [need('Mehl', '200', 'g')], mkId);
  assert.equal(r.changed, false);
  assert.deepEqual(r.list, list);
});

test('Plan-Abgleich: Menge offener Plan-Einträge wird angepasst', () => {
  const list = [{ id: 'a', name: 'Mehl', amount: '200', unit: 'g', checked: false, source: 'plan' }];
  const r = reconcilePlanNeeds(list, [need('Mehl', '350', 'g')], mkId);
  assert.equal(r.changed, true);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].id, 'a');
  assert.equal(r.list[0].amount, '350');
});

test('Plan-Abgleich: nicht mehr benötigte offene Plan-Einträge verschwinden', () => {
  const list = [{ id: 'a', name: 'Mehl', amount: '200', unit: 'g', checked: false, source: 'plan' }];
  const r = reconcilePlanNeeds(list, [], mkId);
  assert.equal(r.changed, true);
  assert.deepEqual(r.list, []);
});

test('Plan-Abgleich: eigene und abgehakte Einträge bleiben unberührt', () => {
  const list = [
    { id: 'm', name: 'Milch', amount: '1', unit: 'l', checked: false, source: 'manuell' },
    { id: 'r', name: 'Eier', amount: '6', unit: '', checked: false, source: 'rezept' },
    { id: 'c', name: 'Butter', amount: '250', unit: 'g', checked: true, source: 'plan' },
    { id: 'x', name: 'Hefe', amount: '1', unit: '', checked: true, source: 'manuell' }
  ];
  const r = reconcilePlanNeeds(list, [], mkId);
  assert.equal(r.changed, false);
  assert.deepEqual(r.list, list);
});

test('Plan-Abgleich: Zutat, die schon eigen offen steht oder gekauft ist, wird nicht doppelt angelegt', () => {
  const list = [
    { id: 'm', name: 'Milch', amount: '1', unit: 'l', checked: false, source: 'manuell' },
    { id: 'c', name: 'Butter', amount: '250', unit: 'g', checked: true, source: 'plan' }
  ];
  const r = reconcilePlanNeeds(list, [need('Milch', '500', 'ml'), need('Butter', '250', 'g'), need('Zucker', '100', 'g')], mkId);
  assert.deepEqual(r.list.map(s => s.name), ['Milch', 'Butter', 'Zucker']);
  assert.equal(r.list[0].amount, '1');
});

test('Plan-Abgleich: dieselbe Zutat in zwei Einheiten bleibt getrennt', () => {
  const r = reconcilePlanNeeds([], [need('Mehl', '200', 'g'), need('Mehl', '1', 'Packung')], mkId);
  assert.deepEqual(r.list.map(s => [s.amount, s.unit]), [['200', 'g'], ['1', 'Packung']]);
  const again = reconcilePlanNeeds(r.list, [need('Mehl', '200', 'g'), need('Mehl', '1', 'Packung')], mkId);
  assert.equal(again.changed, false);
});
