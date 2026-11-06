const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

class FakeElement {
  constructor() {
    this.value = "";
    this.textContent = "";
    this.className = "";
    this.style = {};
    this.children = [];
    this.handlers = {};
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      contains: name => this.classes.has(name),
      toggle: name => {
        if (this.classes.has(name)) {
          this.classes.delete(name);
          return false;
        }
        this.classes.add(name);
        return true;
      }
    };
  }
  addEventListener(event, handler) { this.handlers[event] = handler; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this[key] = value; }
  removeAttribute(key) { delete this[key]; }
  focus() {}
  scrollIntoView() {}
  reset() {}
  remove() {}
  click() {}
}

function createApp(confirmDelete = true, sharedMemory = new Map()) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  get("category-sort").value = "default";
  get("category-items").value = "0";
  const memory = sharedMemory;
  let exportedCsv = null;
  const storage = {
    getItem: key => memory.has(key) ? memory.get(key) : null,
    setItem: (key, value) => memory.set(key, value)
  };
  let exports = 0;
  const document = {
    getElementById: get,
    querySelector: () => new FakeElement(),
    createElement: () => new FakeElement(),
    createTextNode: text => ({ textContent: text }),
    body: new FakeElement()
  };
  const context = {
    document, localStorage: storage, TextEncoder,
    window: { localStorage: storage, addEventListener() {} },
    confirm: () => confirmDelete,
    URL: { createObjectURL: () => { exports++; return "blob:test"; }, revokeObjectURL() {} },
    Blob: class { constructor(parts) { exportedCsv = parts.join(""); } },
    setTimeout: callback => callback(),
    console
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8"), context);
  vm.runInContext(script, context, { filename: "script.js" });
  const fire = (id, type) => get(id).handlers[type]({ preventDefault() {} });
  const saved = () => memory.has("category-dashboard:v1") ? JSON.parse(memory.get("category-dashboard:v1")).categories : null;
  const parseBackup = vm.runInContext("DashboardData.parseBackup", context);
  return { get, fire, saved, parseBackup, context, memory, exportsCount: () => exports, exportedCsv: () => exportedCsv };
}

test("initial dashboard shows default data", () => {
  const app = createApp();
  assert.equal(app.get("total-categories").textContent, "3");
  assert.equal(app.get("total-items").textContent, "37");
});

test("adding a category updates totals and storage", () => {
  const app = createApp();
  app.get("new-category").value = "Books";
  app.get("category-description").value = "Novels";
  app.get("category-items").value = "8";
  app.fire("category-form", "submit");
  assert.equal(app.get("total-categories").textContent, "4");
  assert.equal(app.get("total-items").textContent, "45");
  assert.equal(app.saved()[3].name, "Books");
});

test("duplicate names and invalid quantities are rejected", () => {
  const app = createApp();
  app.get("new-category").value = "gaming";
  app.get("category-items").value = "3";
  app.fire("category-form", "submit");
  assert.match(app.get("category-message").textContent, /already exists/);
  app.get("new-category").value = "Books";
  app.get("category-items").value = "-1";
  app.fire("category-form", "submit");
  assert.match(app.get("category-message").textContent, /whole number/);
  assert.equal(app.get("total-categories").textContent, "3");
});

test("inline editing changes the selected category and totals", () => {
  const app = createApp();
  const edit = app.get("category-list").children[0].children[3].children[0];
  edit.handlers.click();
  assert.equal(app.get("editor-heading").textContent, "Edit category");
  app.get("new-category").value = "Board games";
  app.get("category-items").value = "19";
  app.fire("category-form", "submit");
  assert.equal(app.saved()[0].name, "Board games");
  assert.equal(app.get("total-items").textContent, "41");
});

test("deleting a category updates the dashboard", () => {
  const app = createApp();
  const remove = app.get("category-list").children[0].children[3].children[1];
  remove.handlers.click();
  assert.equal(app.get("total-categories").textContent, "2");
  assert.equal(app.get("total-items").textContent, "22");
});

test("search filters visible categories", () => {
  const app = createApp();
  app.get("category-search").value = "movies";
  app.fire("category-search", "input");
  assert.equal(app.get("visible-count").textContent, "1 category");
  assert.equal(app.get("category-list").children.length, 1);
});

test("dark theme persists, and export creates a download", () => {
  const app = createApp();
  app.fire("background-button", "click");
  assert.equal(app.get("background-button").textContent, "Light mode");
  app.fire("export-button", "click");
  assert.equal(app.exportsCount(), 1);
});


test("saved data and theme survive a fresh page load", () => {
  const memory = new Map();
  const first = createApp(true, memory);
  first.get("new-category").value = "Books";
  first.get("category-items").value = "4";
  first.fire("category-form", "submit");
  first.fire("background-button", "click");
  const refreshed = createApp(true, memory);
  assert.equal(refreshed.get("total-categories").textContent, "4");
  assert.equal(refreshed.get("total-items").textContent, "41");
  assert.equal(refreshed.get("background-button").textContent, "Light mode");
});

test("submitting the same category twice does not create duplicates", () => {
  const app = createApp();
  app.get("new-category").value = "Books";
  app.get("category-items").value = "2";
  app.fire("category-form", "submit");
  app.fire("category-form", "submit");
  assert.equal(app.saved().filter(item => item.name === "Books").length, 1);
});

test("cancelling an edit leaves stored data unchanged", () => {
  const app = createApp();
  const edit = app.get("category-list").children[0].children[3].children[0];
  edit.handlers.click();
  app.get("new-category").value = "Changed name";
  app.fire("cancel-edit-button", "click");
  assert.equal(app.saved(), null);
  assert.equal(app.get("editor-heading").textContent, "Add a category");
  assert.equal(app.get("total-items").textContent, "37");
});

test("cancelling a deletion preserves the category", () => {
  const app = createApp(false);
  const remove = app.get("category-list").children[0].children[3].children[1];
  remove.handlers.click();
  assert.equal(app.get("total-categories").textContent, "3");
});

test("CSV output quotes commas and double quotes", () => {
  const app = createApp();
  app.get("new-category").value = "Books";
  app.get("category-description").value = 'Mystery, "classic"';
  app.get("category-items").value = "5";
  app.fire("category-form", "submit");
  app.fire("export-button", "click");
  assert.match(app.exportedCsv(), /"Books","Mystery, ""classic""","5"/);
  assert.match(app.exportedCsv(), /"name","description","items"/);
});

test("sorting by item count changes visible order", () => {
  const app = createApp();
  app.get("category-sort").value = "low";
  app.fire("category-sort", "change");
  assert.equal(app.get("category-list").children[0].children[0].textContent, "Movies");
});

test("CSV exports spreadsheet formulas as text", () => {
  const app = createApp();
  app.get("new-category").value = "Finance";
  app.get("category-description").value = "=SUM(1,2)";
  app.get("category-items").value = "1";
  app.fire("category-form", "submit");
  app.fire("export-button", "click");
  assert.ok(app.exportedCsv().includes("\"'=SUM(1,2)\""));
});


test("CSV import parser round-trips quoted fields and embedded newlines", () => {
  const app = createApp();
  const input = '\uFEFF"name","description","items"\r\n' +
    '"Books","Mystery, ""classic""\nnotes","8"\r\n';
  const restored = app.parseBackup(input);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].name, "Books");
  assert.equal(restored[0].description, 'Mystery, "classic"\nnotes');
  assert.equal(restored[0].items, 8);
});

test("CSV import parser rejects incorrect columns and duplicate names", () => {
  const app = createApp();
  assert.throws(() => app.parseBackup("name,price,items\nBooks,20,2\n"), /Expected CSV/);
  assert.throws(() => app.parseBackup(
    '"name","description","items"\n"Books","","2"\n"books","","3"\n'
  ), /Duplicate category/);
});

test("CSV import parser rejects unsafe quantities and malformed quotes", () => {
  const app = createApp();
  assert.throws(() => app.parseBackup(
    '"name","description","items"\n"Books","","-3"\n'
  ), /Invalid data/);
  assert.throws(() => app.parseBackup(
    '"name","description","items"\n"Books","bad,3\n'
  ), /unclosed quotation/);
});

test('deleted category survives reload and can be restored', () => {
  const memory = new Map();
  const first = createApp(true, memory);
  first.get('category-list').children[0].children[3].children[1].handlers.click();
  const next = createApp(true, memory);
  assert.equal(next.get('deleted-count').textContent, '1');
  next.get('deleted-list').children[0].children[1].children[0].handlers.click();
  assert.equal(next.get('total-categories').textContent, '3');
  assert.equal(next.get('deleted-count').textContent, '0');
});
test('previous save captures pre-edit values and restores the dashboard', () => {
  const app = createApp();
  app.get('new-category').value = 'Books';
  app.fire('category-form', 'submit');
  app.fire('recover-button', 'click');
  assert.equal(app.get('total-categories').textContent, '3');
  assert.equal(app.saved().some(c => c.name === 'Books'), false);
});
test('restoring a duplicate name leaves trash intact', () => {
  const app = createApp();
  app.get('category-list').children[0].children[3].children[1].handlers.click();
  app.get('new-category').value = 'gaming';
  app.fire('category-form', 'submit');
  app.get('deleted-list').children[0].children[1].children[0].handlers.click();
  assert.equal(app.get('deleted-count').textContent, '1');
  assert.match(app.get('import-message').textContent, /already exists/);
});
test('JSON import commits only after full validation; malformed import preserves state', async () => {
  const app = createApp();
  const trigger = text => app.get('import-file').handlers.change({ target: { value: '', files: [{ name: 'backup.json', size: text.length, text: async () => text }] } });
  await trigger(JSON.stringify({ version: 1, categories: [{ name: 'Imported', description: '', items: 7 }], trash: [] }));
  assert.equal(app.saved()[0].name, 'Imported');
  await trigger('{broken');
  assert.equal(app.saved()[0].name, 'Imported');
  assert.match(app.get('import-message').textContent, /Nothing was replaced/);
});
test('cancelled import and oversized files preserve current view', async () => {
  const app = createApp(false);
  await app.get('import-file').handlers.change({ target: { files: [{ name: 'data.csv', size: 40, text: async () => 'name,description,items\nBooks,,1' }] } });
  assert.equal(app.saved(), null);
  assert.match(app.get('import-message').textContent, /cancelled/);
  await app.get('import-file').handlers.change({ target: { files: [{ size: 1024 * 1024 + 1 }] } });
  assert.match(app.get('import-message').textContent, /1 MB/);
});


test('corrupt storage exports raw data instead of a misleading empty backup', () => {
  const app = createApp(true, new Map([['category-dashboard:v1', '{broken']]));
  app.fire('backup-button', 'click');
  assert.equal(app.exportsCount(), 0);
  assert.match(app.get('import-message').textContent, /Download stored data/);
  app.fire('raw-backup-button', 'click');
  assert.equal(JSON.parse(app.exportedCsv()).current, '{broken');
});


test('queued double deletion cannot delete a different category after indexes shift', () => {
  const app = createApp();
  const queue = [];
  app.context.window.navigator = { locks: { request: (_, callback) => { queue.push(callback); return Promise.resolve(); } } };
  const remove = app.get('category-list').children[0].children[3].children[1];
  remove.handlers.click();
  remove.handlers.click();
  queue.forEach(action => action());
  assert.equal(app.get('total-categories').textContent, '2');
  assert.deepEqual(app.saved().map(c => c.name), ['Movies', 'Sport']);
});
