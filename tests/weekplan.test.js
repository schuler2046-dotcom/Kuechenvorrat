import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swapDays } from '../weekplan.js';

test('Tauschen: zwei belegte Tage wechseln die Gerichte', () => {
  const wp = { Montag: 'a', Mittwoch: 'b', Freitag: 'c' };
  assert.deepEqual(swapDays(wp, 'Montag', 'Mittwoch'), { Montag: 'b', Mittwoch: 'a', Freitag: 'c' });
});

test('Tauschen: Zieltag frei, das Gericht zieht um', () => {
  const wp = { Montag: 'a', Freitag: 'c' };
  assert.deepEqual(swapDays(wp, 'Montag', 'Mittwoch'), { Mittwoch: 'a', Freitag: 'c' });
  assert.deepEqual(swapDays(wp, 'Mittwoch', 'Montag'), { Mittwoch: 'a', Freitag: 'c' });
});

test('Tauschen: zwei freie Tage und derselbe Tag ändern nichts', () => {
  const wp = { Montag: 'a' };
  assert.deepEqual(swapDays(wp, 'Dienstag', 'Mittwoch'), { Montag: 'a' });
  assert.deepEqual(swapDays(wp, 'Montag', 'Montag'), { Montag: 'a' });
});

test('Tauschen: das Original bleibt unverändert, dasselbe Rezept bleibt erhalten', () => {
  const wp = { Montag: 'a', Mittwoch: 'b' };
  const out = swapDays(wp, 'Montag', 'Mittwoch');
  assert.deepEqual(wp, { Montag: 'a', Mittwoch: 'b' });
  assert.notEqual(out, wp);
  assert.deepEqual(Object.values(out).sort(), ['a', 'b']);
});
