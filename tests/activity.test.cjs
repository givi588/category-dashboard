const test = require('node:test');
const assert = require('node:assert/strict');
const { Log, KEY, LIMIT } = require('../activity.js');
function memory(initial) {
  const data = new Map(initial ? [[KEY, initial]] : []);
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const category = { name: 'Books', description: 'Fiction', items: 5 };
test('activity starts empty without writing or inventing history', () => {
  const storage = memory(); const log = new Log(storage);
  assert.deepEqual(log.events, []); assert.equal(storage.data.size, 0);
  assert.equal(log.updated(category), null);
});
test('successful events survive reload and only matching snapshots have update times', () => {
  const storage = memory(); const log = new Log(storage);
  log.append('edit', category, '2026-11-18T01:00:00Z');
  const loaded = new Log(storage);
  assert.equal(loaded.updated(category), '2026-11-18T01:00:00Z');
  assert.equal(loaded.updated({ ...category, items: 6 }), null);
  loaded.append('import'); assert.equal(loaded.updated(category), null);
});
test('corrupt and future-version activity bytes are preserved', () => {
  for (const raw of ['{broken', '{"version":9,"events":[]}']) {
    const storage = memory(raw); const log = new Log(storage);
    assert.equal(log.append('add', category), false);
    assert.equal(storage.getItem(KEY), raw); assert.ok(log.error);
  }
});
test('quota failure does not replace in-memory activity', () => {
  const storage = memory(); const log = new Log(storage);
  storage.setItem = () => { throw new Error('Quota'); };
  assert.equal(log.append('add', category), false); assert.deepEqual(log.events, []);
});
test('activity re-reads the latest log and retains only 100 events', () => {
  const storage = memory(); const first = new Log(storage); const second = new Log(storage);
  first.append('add', category); second.append('edit', category);
  assert.equal(second.events.length, 2);
  for (let i = 0; i < 110; i++) second.append('backup');
  assert.equal(second.events.length, LIMIT);
});
