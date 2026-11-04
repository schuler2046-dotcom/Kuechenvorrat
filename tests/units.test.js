import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmount, unitInfo, canonicalUnit, qty, valueIn, stockIn, reduceAmount,
  addAmounts, stepFor, formatQuantity, formatBase, suggestPackSize
} from '../units.js';

test('parseAmount versteht Komma, Brüche und Text', () => {
  assert.equal(parseAmount('1,5'), 1.5);
  assert.equal(parseAmount('1.5'), 1.5);
  assert.equal(parseAmount('1/2'), 0.5);
  assert.equal(parseAmount('1 1/2'), 1.5);
  assert.equal(parseAmount('½'), 0.5);
  assert.equal(parseAmount('1½'), 1.5);
  assert.equal(parseAmount(250), 250);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('etwas'), null);
  assert.equal(parseAmount(null), null);
});

test('Einheiten: Alias und kanonische Schreibweise', () => {
  assert.equal(canonicalUnit('Stück'), 'stk');
  assert.equal(canonicalUnit(''), '');
  assert.equal(canonicalUnit('Liter'), 'l');
  assert.equal(canonicalUnit('Dosen'), 'Dose');
  assert.equal(canonicalUnit('EL'), 'EL');
  assert.equal(canonicalUnit('Büschel'), 'Büschel');
  assert.equal(unitInfo('Zehen').dim, 'item:Zehe');
  assert.equal(unitInfo('Büschel'), null);
});

test('EL/TL/Prise werden metrisch umgerechnet', () => {
  assert.equal(formatQuantity('2', 'EL'), '30 ml');
  assert.equal(formatQuantity('1', 'TL'), '5 ml');
  assert.equal(formatQuantity('1', 'Prise'), '500 mg');
});

test('Formatierung: Einheitenwechsel und Brüche', () => {
  assert.equal(formatQuantity('1500', 'g'), '1,5 kg');
  assert.equal(formatQuantity('0,5', 'l'), '500 ml');
  assert.equal(formatQuantity('2', 'stk'), '2 stk');
  assert.equal(formatQuantity('3', ''), '3');
  assert.equal(formatQuantity('0.75', 'Packung'), '¾ Packung');
  assert.equal(formatQuantity('2', 'Packung'), '2 Packungen');
  assert.equal(formatQuantity('1', 'Dose'), '1 Dose');
  assert.equal(formatQuantity('', ''), '');
  assert.equal(formatQuantity('nach Geschmack', ''), 'nach Geschmack');
  assert.equal(formatBase('mass', 250), '250 g');
  assert.equal(formatBase('volume', 2000), '2 l');
});

test('Packung mit Packungsgröße: 250 g Mehl gegen 2 Packungen à 1 kg', () => {
  const have = qty('2', 'Packung', 1000, 'g');
  assert.equal(valueIn(have, 'mass'), 2000);
  assert.equal(valueIn(have, 'volume'), null);
  const item = { amount: '2', unit: 'Packung', packSize: 1000, packUnit: 'g' };
  assert.equal(stockIn(item, 'mass'), 2000);
  assert.equal(stockIn(item, 'volume'), null);
  assert.equal(reduceAmount(item, 250, 'mass'), 1.75);
});

test('Teilpackung und nie unter 0', () => {
  const item = { amount: '1', unit: 'Packung', packSize: 1000, packUnit: 'g' };
  assert.equal(reduceAmount(item, 250, 'mass'), 0.75);
  assert.equal(formatQuantity(0.75, 'Packung'), '¾ Packung');
  assert.equal(reduceAmount(item, 5000, 'mass'), 0);
  assert.equal(reduceAmount({ amount: '500', unit: 'g' }, 600, 'mass'), 0);
});

test('Nicht umrechenbar liefert null statt falscher Werte', () => {
  const dose = { amount: '2', unit: 'Dose' };
  assert.equal(stockIn(dose, 'mass'), null);
  assert.equal(reduceAmount(dose, 100, 'mass'), null);
  assert.equal(valueIn(qty('2', 'Dose'), 'item:Dose'), 2);
  assert.equal(stockIn({ amount: 'viel', unit: 'g' }, 'mass'), null);
});

test('Stück gegen Zehe sind verschiedene Dimensionen', () => {
  assert.notEqual(qty('1', 'stk').dim, qty('2', 'Zehen').dim);
});

test('Mengen addieren: gleiche Dimension, sonst null', () => {
  assert.deepEqual(addAmounts('1', 'l', '500', 'ml'), { amount: 1.5, unit: 'l' });
  assert.deepEqual(addAmounts('500', 'g', '1', 'kg'), { amount: 1500, unit: 'g' });
  assert.deepEqual(addAmounts('2', '', '1', 'Stück'), { amount: 3, unit: '' });
  assert.equal(addAmounts('1', 'l', '1', 'kg'), null);
  assert.equal(addAmounts('1', 'Dose', '1', 'Packung'), null);
  assert.equal(addAmounts('x', 'g', '1', 'g'), null);
});

test('Stepper-Schritte je Einheit', () => {
  assert.equal(stepFor('g'), 50);
  assert.equal(stepFor('ml'), 50);
  assert.equal(stepFor('kg'), 0.5);
  assert.equal(stepFor('l'), 0.5);
  assert.equal(stepFor('stk'), 1);
  assert.equal(stepFor('Packung'), 1);
  assert.equal(stepFor(''), 1);
});

test('Packungsgrößen-Vorschläge', () => {
  assert.deepEqual(suggestPackSize('Mehl'), { size: 1000, unit: 'g' });
  assert.deepEqual(suggestPackSize('Puderzucker'), { size: 500, unit: 'g' });
  assert.deepEqual(suggestPackSize('Spaghetti'), { size: 500, unit: 'g' });
  assert.deepEqual(suggestPackSize('Tomaten passiert'), { size: 500, unit: 'g' });
  assert.deepEqual(suggestPackSize('Kokosmilch'), { size: 400, unit: 'ml' });
  assert.equal(suggestPackSize('Kichererbsen'), null);
});
