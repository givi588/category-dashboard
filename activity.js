"use strict";

// Optional UI history is isolated from category data and never migrated on load.
(function (root) {
  const KEY = "category-dashboard:activity:v1";
  const LIMIT = 100;
  const kinds = new Set(["add", "edit", "delete", "restore", "purge", "import", "recover", "backup"]);
  function parse(raw) {
    if (raw === null) return [];
    if (raw.length > 100000) throw new Error("Activity history is too large.");
    const state = JSON.parse(raw);
    if (state.version !== 1 || !Array.isArray(state.events) || state.events.length > LIMIT) throw new Error("Unsupported activity history.");
    return state.events.map(event => {
      if (!event || !kinds.has(event.kind) || typeof event.at !== "string" || !Number.isFinite(Date.parse(event.at))) throw new Error("Invalid activity history.");
      const category = event.category;
      if (category !== null && (!category || typeof category.name !== "string" || category.name.length > 30 || typeof category.description !== "string" || category.description.length > 120 || !Number.isSafeInteger(category.items) || category.items < 0 || category.items > 1000000)) throw new Error("Invalid activity category.");
      return { kind: event.kind, at: event.at, category };
    });
  }
  class Log {
    constructor(storage) {
      this.storage = storage;
      this.events = [];
      this.error = "";
      try { this.events = parse(storage.getItem(KEY)); } catch (error) { this.error = error.message; }
    }
    append(kind, category = null, at = new Date().toISOString()) {
      try {
        const events = parse(this.storage.getItem(KEY));
        const next = { version: 1, events: [{ kind, at, category }, ...events].slice(0, LIMIT) };
        parse(JSON.stringify(next));
        this.storage.setItem(KEY, JSON.stringify(next));
        this.events = next.events;
        this.error = "";
        return true;
      } catch (error) { this.error = error.message; return false; }
    }
    updated(category) {
      for (const event of this.events) {
        // Import/recovery has no per-category timestamps. Do not infer them.
        if (["import", "recover"].includes(event.kind)) return null;
        if (event.category && event.category.name === category.name) {
          return ["add", "edit", "restore"].includes(event.kind) && event.category.description === category.description && event.category.items === category.items ? event.at : null;
        }
      }
      return null;
    }
  }
  const api = { KEY, LIMIT, Log, parse };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DashboardActivity = api;
})(globalThis);
