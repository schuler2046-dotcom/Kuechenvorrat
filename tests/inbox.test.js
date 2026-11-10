import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInstagramUrl, addInboxLink, removeInboxEntry, visibleInbox } from '../inbox.js';

const newId = () => 'id1';

test('Links: Beitrag, Reel und Link mit Zusatztext werden erkannt', () => {
  assert.deepEqual(parseInstagramUrl('https://www.instagram.com/p/DNF3AFhsG6L/?igsh=abc'), { url: 'https://www.instagram.com/p/DNF3AFhsG6L/', shortcode: 'DNF3AFhsG6L' });
  assert.equal(parseInstagramUrl('schau mal instagram.com/reel/Dab-_x1/ lecker').shortcode, 'Dab-_x1');
  assert.equal(parseInstagramUrl('https://example.com/p/abc'), null);
  assert.equal(parseInstagramUrl(''), null);
});

test('Warteliste: neuer Link wird offen vorgemerkt', () => {
  const r = addInboxLink([], [], 'https://www.instagram.com/p/AAA/', newId, 'T');
  assert.equal(r.status, 'neu');
  assert.deepEqual(r.inbox, [{ id: 'id1', url: 'https://www.instagram.com/p/AAA/', shortcode: 'AAA', addedAt: 'T', status: 'offen' }]);
});

test('Warteliste: kein Instagram-Link wird abgelehnt', () => {
  const r = addInboxLink([], [], 'hallo', newId);
  assert.equal(r.status, 'ungueltig');
  assert.deepEqual(r.inbox, []);
});

test('Warteliste: Link, der schon wartet, wird nicht doppelt angelegt', () => {
  const first = addInboxLink([], [], 'https://www.instagram.com/p/AAA/', newId);
  const again = addInboxLink(first.inbox, [], 'https://www.instagram.com/reel/AAA/', newId);
  assert.equal(again.status, 'doppelt');
  assert.equal(again.inbox.length, 1);
});

test('Warteliste: Rezept existiert schon, es wird darauf verwiesen', () => {
  const r = addInboxLink([], [{ id: 'ig-AAA', igId: 'AAA' }], 'https://www.instagram.com/p/AAA/', newId);
  assert.equal(r.status, 'vorhanden');
  assert.equal(r.recipeId, 'ig-AAA');
  assert.deepEqual(r.inbox, []);
});

test('Warteliste: erledigter Link kann erneut vorgemerkt werden, falls das Rezept gelöscht wurde', () => {
  const done = [{ id: 'x', shortcode: 'AAA', status: 'erledigt' }];
  assert.equal(addInboxLink(done, [], 'https://www.instagram.com/p/AAA/', newId).status, 'neu');
});

test('Warteliste: Entfernen und Anzeige', () => {
  const list = [
    { id: '1', status: 'erledigt' }, { id: '2', status: 'erledigt' }, { id: '3', status: 'erledigt' },
    { id: '4', status: 'erledigt' }, { id: '5', status: 'offen' }, { id: '6', status: 'fehler' }
  ];
  assert.deepEqual(visibleInbox(list).map(e => e.id), ['5', '6', '4', '3', '2']);
  assert.deepEqual(removeInboxEntry(list, '5').map(e => e.id), ['1', '2', '3', '4', '6']);
  assert.deepEqual(visibleInbox(null), []);
});
