import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRecipe } from '../matching.js';
import { needFor, mergeNeeds, needsOfEvaluation } from '../shopping.js';

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
