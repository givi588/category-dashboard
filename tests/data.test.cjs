const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../data.js');
const category = (name = 'Books') => ({ name, description: 'Notes', items: 4 });
const state = (categories = [category()], trash = []) => ({ version: 1, categories, trash });
function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('legacy data migrates only on a successful write, leaving original bytes intact', () => {
  const legacy = JSON.stringify([category('Café')]);
  const storage = memory({ [D.LEGACY_KEY]: legacy });
  const store = new D.Store(storage);
  assert.equal(storage.getItem(D.KEY), null);
  store.commit(state([category('Updated')]));
  assert.equal(storage.getItem(D.LEGACY_KEY), legacy);
  assert.equal(store.previous().categories[0].name, 'Café');
});
test('an intentionally empty legacy list stays empty', () => {
  assert.deepEqual(new D.Store(memory({ categories: '[]' })).state.categories, []);
});
test('malformed, duplicate, oversized and future-version saved data are blocked without writes', () => {
  for (const raw of ['{', JSON.stringify(state([category(), category('books')])), JSON.stringify({ ...state(), version: 2 }), JSON.stringify(state([{ ...category(), description: 'x'.repeat(121) }]))]) {
    const storage = memory({ [D.KEY]: raw });
    const store = new D.Store(storage);
    assert.equal(store.blocked, true);
    assert.throws(() => store.commit(state()));
    assert.equal(storage.getItem(D.KEY), raw);
    assert.equal(storage.getItem(D.PREVIOUS_KEY), null);
  }
});
test('storage read access failure does not create sample data', () => {
  const store = new D.Store({ getItem() { throw new Error('Denied'); } });
  assert.equal(store.blocked, true);
  assert.deepEqual(store.state.categories, []);
});
test('backup or primary quota failures preserve saved and in-memory categories', () => {
  for (const failingKey of [D.KEY, D.PREVIOUS_KEY]) {
    const raw = D.serialize(state());
    const storage = memory({ [D.KEY]: raw });
    const store = new D.Store(storage);
    const write = storage.setItem;
    storage.setItem = (key, value) => { if (key === failingKey) throw new Error('QuotaExceeded'); write(key, value); };
    assert.throws(() => store.commit(state([category('Changed')])), /QuotaExceeded/);
    assert.equal(store.state.categories[0].name, 'Books');
    assert.equal(storage.getItem(D.KEY), raw);
  }
});
test('another tab cannot silently overwrite a newer save', () => {
  const storage = memory();
  const first = new D.Store(storage);
  const second = new D.Store(storage);
  first.commit(state());
  assert.throws(() => second.commit(state([category('Stale')])), /another tab/);
  assert.equal(new D.Store(storage).state.categories[0].name, 'Books');
});
test('legacy data changes in another tab are detected before migration', () => {
  const storage = memory({ categories: '[]' });
  const store = new D.Store(storage);
  storage.setItem('categories', JSON.stringify([category()]));
  assert.throws(() => store.commit(state()), /another tab/);
});
test('previous save restores active and deleted categories across reloads', () => {
  const storage = memory({ [D.KEY]: D.serialize(state([category()], [category('Deleted')])) });
  new D.Store(storage).commit(state([category('Imported')]));
  const reloaded = new D.Store(storage);
  reloaded.recover();
  assert.deepEqual(reloaded.state, state([category()], [category('Deleted')]));
  assert.equal(reloaded.previous().categories[0].name, 'Imported');
});
test('explicit recovery preserves corrupt bytes as previous save', () => {
  const storage = memory({ [D.KEY]: '{broken', [D.PREVIOUS_KEY]: D.serialize(state()) });
  const store = new D.Store(storage);
  store.recover();
  assert.equal(store.blocked, false);
  assert.equal(storage.getItem(D.PREVIOUS_KEY), '{broken');
  assert.deepEqual(store.state, state());
});
test('JSON round trips Unicode, whitespace, formula text, quotes, and deleted data exactly', () => {
  const original = state([{ name: '=1+1', description: "'@text\nCafé, \"quote\"\t", items: 1000000 }], [category('Archived')]);
  assert.deepEqual(D.parseJson(D.serialize(original)), original);
});
test('CSV never evaluates formulas and importer preserves literal apostrophes', () => {
  for (const value of ['=1+1', '+1', '-1', '@SUM(1)', '\t=1', '\rtest', '  =2']) assert.ok(D.csvCell(value).startsWith('"\''));
  assert.equal(D.parseBackup('name,description,items\nBooks,\'@literal,0')[0].description, "'@literal");
});
test('CSV rejects ambiguous headers, bad quoting, unsafe integers and excess rows', () => {
  for (const input of ['"name,description,items"\nBooks,,1', 'name,description,items\nBooks,"x"z,1', 'name,description,items\nBooks,,9007199254740992', 'name,description,items\nBooks,,1.5', 'name,description,items\n' + 'Books,,1\n'.repeat(1001)]) assert.throws(() => D.parseBackup(input));
});
test('limits permit 1000 categories, reject 1001, and enforce safe quantities', () => {
  assert.equal(D.validateCategories(Array.from({ length: 1000 }, (_, i) => category(String(i)))).length, 1000);
  assert.throws(() => D.validateCategories(Array.from({ length: 1001 }, (_, i) => category(String(i)))));
  for (const items of [-1, 0.5, NaN, Infinity, 1000001, '2']) assert.throws(() => D.validateCategories([{ ...category(), items }]));
});
test('invalid import is validated before any backup or primary write', () => {
  const storage = memory({ [D.KEY]: D.serialize(state()) });
  const store = new D.Store(storage);
  const before = [...storage.values];
  assert.throws(() => store.commit(state([category(), category()])));
  assert.deepEqual([...storage.values], before);
});
