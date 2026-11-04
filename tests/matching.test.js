import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchItems, evaluateIngredient, evaluateRecipe, summaryText, isStaple, normKey } from '../matching.js';

const inv = (...items) => items.map((x, i) => ({ id: 'i' + i, ...x }));
const names = m => m.items.map(i => i.name);

test('Öl und Olivenöl', () => {
  const m1 = matchItems('Öl', inv({ name: 'Olivenöl' }));
  assert.deepEqual(names(m1), ['Olivenöl']);
  assert.equal(m1.substitute, false);
  const m2 = matchItems('Olivenöl', inv({ name: 'Rapsöl' }));
  assert.deepEqual(names(m2), ['Rapsöl']);
  assert.equal(m2.substitute, true);
  const m3 = matchItems('Olivenöl', inv({ name: 'Öl' }));
  assert.equal(m3.substitute, true);
  assert.equal(matchItems('Olivenöl', inv({ name: 'Sesamöl' })).items.length, 0);
});

test('Salz trifft nicht Salzstangen, Grundvorrat wird nie fehlen', () => {
  assert.equal(matchItems('Salz', inv({ name: 'Salzstangen' }), { staples: [] }).items.length, 0);
  assert.equal(evaluateIngredient({ name: 'Salz' }, []).status, 'grundvorrat');
  assert.equal(evaluateIngredient({ name: 'Salz und Pfeffer', amount: '' }, []).status, 'grundvorrat');
  assert.ok(isStaple('Wasser'));
  assert.ok(!isStaple('Zucker'));
});

test('Puderzucker ist kein Zucker', () => {
  assert.equal(matchItems('Zucker', inv({ name: 'Puderzucker' })).items.length, 0);
  assert.equal(matchItems('Zucker', inv({ name: 'Brauner Zucker' })).items.length, 0);
  assert.equal(matchItems('Puderzucker', inv({ name: 'Puderzucker' })).items.length, 1);
  assert.equal(matchItems('Zucker', inv({ name: 'Zucker' })).items.length, 1);
  assert.equal(matchItems('Zucker', inv({ name: 'Haushaltszucker' })).items.length, 1);
});

test('Nudeln, Spaghetti, Penne', () => {
  assert.equal(matchItems('Nudeln', inv({ name: 'Spaghetti' })).substitute, false);
  assert.equal(matchItems('Spaghetti', inv({ name: 'Penne' })).substitute, true);
  assert.equal(matchItems('Spaghetti', inv({ name: 'Reis' })).items.length, 0);
});

test('Tomaten: frisch ist nicht passiert', () => {
  assert.equal(matchItems('Tomaten passiert', inv({ name: 'Tomaten stückig' })).items.length, 1);
  assert.equal(matchItems('Dose gehackte Tomaten', inv({ name: 'Passierte Tomaten' })).items.length, 1);
  assert.equal(matchItems('Tomaten', inv({ name: 'Passierte Tomaten' })).items.length, 0);
  assert.equal(matchItems('Dose gehackte Tomaten', inv({ name: 'Tomaten' })).items.length, 0);
});

test('Beiwörter und Plural', () => {
  assert.equal(matchItems('rote Zwiebel', inv({ name: 'Zwiebeln' })).items.length, 1);
  assert.equal(matchItems('Eier', inv({ name: 'Ei' })).items.length, 1);
  assert.equal(matchItems('Kartoffeln', inv({ name: 'festkochende Kartoffeln' })).items.length, 1);
  assert.equal(matchItems('Petersilie, gehackt', inv({ name: 'Petersilie' })).items.length, 1);
  assert.equal(matchItems('Chili', inv({ name: 'Chilipulver' })).items.length, 0);
  assert.equal(matchItems('Käse gerieben', inv({ name: 'Gouda' })).items.length, 1);
  assert.equal(matchItems('Mehl', inv({ name: 'Dinkelmehl' })).items.length, 0);
  assert.equal(matchItems('Milch', inv({ name: 'Kokosmilch' })).items.length, 0);
});

test('Jasminreis wird durch Reis ersetzt', () => {
  const m = matchItems('Jasminreis', inv({ name: 'Reis' }));
  assert.equal(m.items.length, 1);
  assert.equal(m.substitute, true);
  assert.equal(matchItems('Jasminreis', inv({ name: 'Basmatireis' })).substitute, true);
  assert.equal(matchItems('Reis', inv({ name: 'Basmatireis' })).substitute, false);
});

test('Eigene Aliase', () => {
  const ctx = { aliases: { [normKey('Frischkäse')]: 'Philadelphia' } };
  const m = matchItems('Frischkäse', inv({ name: 'Philadelphia' }), ctx);
  assert.equal(m.via, 'alias');
  assert.equal(m.items.length, 1);
});

test('Menge: 250 g Mehl gegen 2 Packungen à 1 kg', () => {
  const stock = inv({ name: 'Mehl', amount: '2', unit: 'Packung', packSize: 1000, packUnit: 'g' });
  assert.equal(evaluateIngredient({ name: 'Mehl', amount: '250', unit: 'g' }, stock).status, 'genug');
});

test('Menge: knapp, Toleranz 10 %, Summe über mehrere Artikel', () => {
  const stock = inv({ name: 'Mehl', amount: '500', unit: 'g' });
  const knapp = evaluateIngredient({ name: 'Mehl', amount: '600', unit: 'g' }, stock);
  assert.equal(knapp.status, 'knapp');
  assert.equal(knapp.short, 100);
  assert.equal(evaluateIngredient({ name: 'Mehl', amount: '540', unit: 'g' }, stock).status, 'genug');
  assert.equal(evaluateIngredient({ name: 'Mehl', amount: '500', unit: 'g' }, inv({ name: 'Mehl', amount: '480', unit: 'g' })).status, 'genug');
  const two = inv({ name: 'Mehl', amount: '300', unit: 'g' }, { name: 'Mehl', amount: '300', unit: 'g' });
  assert.equal(evaluateIngredient({ name: 'Mehl', amount: '500', unit: 'g' }, two).status, 'genug');
});

test('Menge: Portionen skalieren den Bedarf', () => {
  const stock = inv({ name: 'Nudeln', amount: '500', unit: 'g' });
  assert.equal(evaluateIngredient({ name: 'Nudeln', amount: '250', unit: 'g' }, stock, {}, 2).status, 'genug');
  assert.equal(evaluateIngredient({ name: 'Nudeln', amount: '250', unit: 'g' }, stock, {}, 3).status, 'knapp');
});

test('Locker: Gewürze, Kleinmengen, EL/TL', () => {
  const stock = inv({ name: 'Backpulver', amount: '1', unit: 'Päckchen' });
  assert.equal(evaluateIngredient({ name: 'Backpulver', amount: '10', unit: 'g' }, stock).status, 'da');
  assert.equal(evaluateIngredient({ name: 'Backpulver', amount: '2', unit: 'TL' }, stock).status, 'da');
  const gewuerz = inv({ name: 'Paprikapulver', amount: '1', unit: 'Glas', category: 'Gewürze & Saucen' });
  assert.equal(evaluateIngredient({ name: 'Paprikapulver', amount: '50', unit: 'g' }, gewuerz).status, 'da');
});

test('Nicht umrechenbar: Status da statt falschem Alarm', () => {
  const stock = inv({ name: 'Spaghetti', amount: '1', unit: 'Packung' });
  assert.equal(evaluateIngredient({ name: 'Spaghetti', amount: '500', unit: 'g' }, stock).status, 'da');
  const withSize = inv({ name: 'Spaghetti', amount: '1', unit: 'Packung', packSize: 500, packUnit: 'g' });
  assert.equal(evaluateIngredient({ name: 'Spaghetti', amount: '500', unit: 'g' }, withSize).status, 'genug');
  assert.equal(evaluateIngredient({ name: 'Spaghetti', amount: '1000', unit: 'g' }, withSize).status, 'knapp');
});

test('Stückzahlen: Eier', () => {
  const stock = inv({ name: 'Eier', amount: '4', unit: '' });
  assert.equal(evaluateIngredient({ name: 'Ei', amount: '2', unit: 'stk' }, stock).status, 'genug');
  const r = evaluateIngredient({ name: 'Ei', amount: '6', unit: 'stk' }, stock);
  assert.equal(r.status, 'knapp');
  assert.equal(r.short, 2);
});

test('Alternativen mit "oder", fehlende Menge', () => {
  const stock = inv({ name: 'Koriander', amount: '1', unit: 'Bund' });
  assert.equal(evaluateIngredient({ name: 'Petersilie oder Koriander' }, stock).status, 'da');
  assert.equal(evaluateIngredient({ name: 'Limettensaft' }, stock).status, 'fehlt');
  assert.equal(evaluateIngredient({ name: 'Dose gehackte Tomaten' }, inv({ name: 'Passierte Tomaten', amount: '2', unit: 'Packung' })).status, 'da');
});

test('Rezept-Zusammenfassung', () => {
  const stock = inv({ name: 'Mehl', amount: '500', unit: 'g' }, { name: 'Zucker', amount: '1', unit: 'kg' });
  const ok = evaluateRecipe({ ingredients: [{ name: 'Mehl', amount: '200', unit: 'g' }, { name: 'Salz' }] }, stock);
  assert.equal(summaryText(ok), 'alles da');
  const bad = evaluateRecipe({ ingredients: [{ name: 'Mehl', amount: '900', unit: 'g' }, { name: 'Eier', amount: '2', unit: '' }, { name: 'Butter', amount: '100', unit: 'g' }] }, stock);
  assert.equal(summaryText(bad), '2 fehlen, 1 knapp');
  assert.equal(summaryText({ total: 0 }), 'keine Zutaten');
});
