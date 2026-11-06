"use strict";

// Shared, dependency-free domain layer: browser and Node tests use the same code.
(function (root) {
  const KEY = "category-dashboard:v1";
  const PREVIOUS_KEY = "category-dashboard:previous";
  const LEGACY_KEY = "categories";
  const MAX_CATEGORIES = 1000;
  const MAX_FILE_BYTES = 1024 * 1024;
  const defaults = [
    { name: "Gaming", description: "Video games and gaming news", items: 15 },
    { name: "Movies", description: "Films and movie reviews", items: 10 },
    { name: "Sport", description: "Football and other sports", items: 12 }
  ];
  function validateCategories(value) {
    if (!Array.isArray(value) || value.length > MAX_CATEGORIES) {
      throw new Error("Use no more than 1,000 categories per list.");
    }
    const names = new Set();
    return value.map(item => {
      if (!item || typeof item.name !== "string" || !item.name.trim() ||
          item.name.trim().length > 30 || typeof item.description !== "string" ||
          item.description.length > 120 || !Number.isSafeInteger(item.items) ||
          item.items < 0 || item.items > 1000000) {
        throw new Error("Invalid category: check the name, description, and item count.");
      }
      const name = item.name.trim();
      if (names.has(name.toLowerCase())) throw new Error("Duplicate category names are not allowed.");
      names.add(name.toLowerCase());
      return { name, description: item.description, items: item.items };
    });
  }
  function validateState(value) {
    if (!value || value.version !== 1) throw new Error("Unsupported backup version. Nothing has been replaced.");
    return { version: 1, categories: validateCategories(value.categories), trash: validateCategories(value.trash) };
  }
  function parseJson(text) {
    if (text.length > MAX_FILE_BYTES) throw new Error("Backup exceeds 1 MB.");
    return validateState(JSON.parse(text.replace(/^\uFEFF/, "")));
  }
  function serialize(state) { return JSON.stringify(validateState(state), null, 2); }

  class Store {
    constructor(storage) {
      this.storage = storage;
      this.state = { version: 1, categories: [], trash: [] };
      this.blocked = false;
      this.error = "";
      this.raw = null;
      this.legacyRaw = null;
      try {
        this.raw = storage.getItem(KEY);
        this.legacyRaw = storage.getItem(LEGACY_KEY);
        this.state = this.raw !== null ? parseJson(this.raw) : {
          version: 1,
          categories: this.legacyRaw === null ? validateCategories(defaults) : validateCategories(JSON.parse(this.legacyRaw)),
          trash: []
        };
      } catch (error) {
        this.blocked = true;
        this.error = "Saved data could not be read. It has not been overwritten. Download stored data for recovery or restore the previous save. " + error.message;
      }
    }
    commit(next, recovery = false) {
      if (this.blocked && !recovery) throw new Error(this.error);
      const state = validateState(next);
      const serialized = serialize(state);
      if (new TextEncoder().encode(serialized).length > MAX_FILE_BYTES) throw new Error("Backup exceeds 1 MB. Export your data before reducing it.");
      // Detect other tabs before writing; no automatic last-writer-wins overwrite.
      if (this.storage.getItem(KEY) !== this.raw ||
          (this.raw === null && this.storage.getItem(LEGACY_KEY) !== this.legacyRaw)) {
        throw new Error("Data changed in another tab. Export your current view, then reload before editing.");
      }
      // A failed backup or primary write leaves in-memory state unchanged.
      const previous = this.raw === null ? serialize(this.state) : this.raw;
      this.storage.setItem(PREVIOUS_KEY, previous);
      this.storage.setItem(KEY, serialized);
      this.raw = serialized;
      this.state = state;
      this.blocked = false;
      this.error = "";
      return state;
    }
    previous() {
      const raw = this.storage.getItem(PREVIOUS_KEY);
      if (raw === null) throw new Error("No previous save is available yet.");
      return parseJson(raw);
    }
    recover() { return this.commit(this.previous(), true); }
  }
// Parse quoted CSV fields, including escaped quotes and embedded newlines.
function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closed = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      if (field.length || closed) throw new Error("Malformed CSV quotation.");
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      closed = false;
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      closed = false;
    } else {
      if (closed) throw new Error("Unexpected characters after a quoted field.");
      field += ch;
    }
  }
  if (quoted) throw new Error("CSV has an unclosed quotation mark.");
  if (field !== "" || row.length || closed) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseBackup(text) {
  const rows = parseCsv(text);
  if (!rows.length || (rows[0].length !== 3 || rows[0].some((cell, index) => cell !== ["name", "description", "items"][index]))) {
    throw new Error("Expected CSV columns: name, description, items.");
  }
  if (rows.length > 1001) {
    throw new Error("CSV is limited to 1,000 categories.");
  }
  const result = [];
  const names = new Set();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length !== 3) {
      throw new Error("Invalid number of columns on row " + (i + 1) + ".");
    }
    const name = row[0].trim();
    const description = row[1];
    const rawItems = row[2].trim();
    if (!name || name.length > 30 || description.length > 120 ||
        !/^\d+$/.test(rawItems)) {
      throw new Error("Invalid data on row " + (i + 1) + ".");
    }
    const items = Number(rawItems);
    if (!Number.isSafeInteger(items) || items > 1000000) {
      throw new Error("Invalid item count on row " + (i + 1) + ".");
    }
    if (names.has(name.toLowerCase())) {
      throw new Error("Duplicate category on row " + (i + 1) + ".");
    }
    names.add(name.toLowerCase());
    result.push({ name, description, items });
  }
  return result;
}


  function csvCell(value) {
    const text = String(value);
    const safe = /^[\s]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  function toCsv(categories) {
    return "\uFEFF" + [["name", "description", "items"], ...categories.map(c => [c.name, c.description, c.items])]
      .map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }
  const api = { KEY, PREVIOUS_KEY, LEGACY_KEY, MAX_CATEGORIES, MAX_FILE_BYTES, Store,
    validateCategories, validateState, parseJson, serialize, parseCsv, parseBackup, toCsv, csvCell };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DashboardData = api;
})(globalThis);
