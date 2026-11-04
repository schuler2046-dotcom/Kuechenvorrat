import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredientLine, normalizeIngredient } from '../parse.js';

test('Menge und Einheit vorne', () => {
  assert.deepEqual(parseIngredientLine('2 Packungen Mehl'), { name: 'Mehl', amount: '2', unit: 'Packungen' });
  assert.deepEqual(parseIngredientLine('500 g Spaghetti'), { name: 'Spaghetti', amount: '500', unit: 'g' });
  assert.deepEqual(parseIngredientLine('200g Mehl'), { name: 'Mehl', amount: '200', unit: 'g' });
  assert.deepEqual(parseIngredientLine('3 Zehen Knoblauch'), { name: 'Knoblauch', amount: '3', unit: 'Zehen' });
  assert.deepEqual(parseIngredientLine('1,5 l Milch'), { name: 'Milch', amount: '1,5', unit: 'l' });
});

test('Menge hinten, in Klammern, ohne Menge', () => {
  assert.deepEqual(parseIngredientLine('Mehl 200 g'), { name: 'Mehl', amount: '200', unit: 'g' });
  assert.deepEqual(parseIngredientLine('Paprika (2 Stück)'), { name: 'Paprika', amount: '2', unit: 'Stück' });
  assert.deepEqual(parseIngredientLine('Salz'), { name: 'Salz', amount: '', unit: '' });
  assert.deepEqual(parseIngredientLine('2x Paprika'), { name: 'Paprika', amount: '2', unit: '' });
});

test('normalizeIngredient trennt eingetippte Mengen im Namen', () => {
  assert.deepEqual(normalizeIngredient({ name: '200g Mehl', amount: '', unit: '' }), { name: 'Mehl', amount: '200', unit: 'g' });
  const keep = { name: 'Mehl', amount: '100', unit: 'g' };
  assert.equal(normalizeIngredient(keep), keep);
});
