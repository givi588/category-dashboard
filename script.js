"use strict";

const Data = globalThis.DashboardData;
const THEME_KEY = "theme";
// Access to localStorage itself can throw in restricted browsing contexts.
let storage;
try { storage = window.localStorage; } catch (error) {
  storage = { getItem() { throw error; }, setItem() { throw error; } };
}
const store = new Data.Store(storage);
const activity = new globalThis.DashboardActivity.Log(storage);
const editorDialog = document.getElementById("category-dialog");
let currentPage = 1;
const PAGE_SIZE = 5;
let showAllActivity = false;
function openEditor() {
  if (!editorDialog.open) editorDialog.showModal();
  nameInput.focus();
}
function revealRecovery() { document.getElementById("recovery").open = true; }
function recordActivity(kind, category = null) {
  activity.append(kind, category);
  renderActivity();
}
function formatDate(at) {
  return new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function renderActivity() {
  const list = document.getElementById("activity-list");
  list.replaceChildren();
  document.getElementById("activity-warning").textContent = activity.error ? "Activity history is unavailable. Existing history has not been replaced; category data is separate." : "";
  const backup = activity.events.find(event => event.kind === "backup");
  document.getElementById("backup-status").textContent = backup ? "JSON export requested: " + formatDate(backup.at) : "No JSON export recorded";
  const labels = { add: "Category created", edit: "Category updated", delete: "Category deleted", restore: "Category restored", purge: "Permanently deleted", import: "Categories imported", recover: "Previous save restored", backup: "JSON export requested" };
  const descriptions = { add: "Added to your workspace", edit: "Category details saved", delete: "Moved to Recently deleted", restore: "Returned to active categories", purge: "Removed from Recently deleted", import: "Previous save kept for recovery", recover: "Workspace restored from previous save", backup: "Check your downloads for the file" };
  if (!activity.events.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No activity recorded yet. Your next category change will appear here.";
    list.append(empty);
  }
  activity.events.slice(0, showAllActivity ? 100 : 4).forEach(event => {
    const row = document.createElement("li");
    const symbol = document.createElement("span");
    symbol.className = "activity-symbol";
    symbol.setAttribute("aria-hidden", "true");
    const paths = { add: "M12 5v14M5 12h14", edit: "M3 3h8l10 10-8 8L3 11Z", delete: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7m4-7v7", restore: "M3 10a9 9 0 1 1 2 9M3 4v6h6", transfer: "M7 3v16m-4-4 4 4 4-4M17 21V5m-4 4 4-4 4 4" };
    const path = paths[event.kind] || (["recover"].includes(event.kind) ? paths.restore : event.kind === "purge" ? paths.delete : paths.transfer);
    // Only fixed application-owned SVG paths are inserted; event content uses textContent.
    symbol.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg>';
    const copy = document.createElement("div");
    copy.className = "activity-copy";
    const title = document.createElement("span");
    title.textContent = event.category ? labels[event.kind] + ': “' + event.category.name + '”' : labels[event.kind];
    const detail = document.createElement("p");
    detail.textContent = descriptions[event.kind];
    copy.append(title, detail);
    const time = document.createElement("time");
    time.setAttribute("datetime", event.at);
    time.textContent = formatDate(event.at);
    row.append(symbol, copy, time);
    list.append(row);
  });
  const toggle = document.getElementById("activity-toggle");
  toggle.textContent = showAllActivity ? "Show less" : "View all";
  toggle.setAttribute("aria-expanded", String(showAllActivity));
  toggle.disabled = activity.events.length <= 4;
}

const form = document.getElementById("category-form");
const nameInput = document.getElementById("new-category");
const descriptionInput = document.getElementById("category-description");
const itemsInput = document.getElementById("category-items");
const message = document.getElementById("category-message");
const searchInput = document.getElementById("category-search");
const sortInput = document.getElementById("category-sort");
const categoryList = document.getElementById("category-list");
const cancelButton = document.getElementById("cancel-edit-button");
const saveButton = document.getElementById("save-category-button");
const editorHeading = document.getElementById("editor-heading");
const editorDescription = document.getElementById("editor-description");

let editingIndex = null;

let categories = store.state.categories;
let trash = store.state.trash;

// Serialize this app's writers across tabs when Web Locks is available.
// The storage comparison still rejects stale views after a lock is acquired.
function runExclusive(action) {
  const locks = window.navigator && window.navigator.locks;
  if (!locks) return action();
  return locks.request(Data.KEY, action).catch(error => {
    setImportMessage("The operation could not be completed. " + error.message, "error");
  });
}

function saveCategories() {
  try {
    store.commit({ version: 1, categories, trash });
    renderRecovery();
    return true;
  } catch (error) {
    setMessage("Changes were not saved. " + error.message, "error");
    setImportMessage("Changes were not saved. " + error.message, "error");
    return false;
  }
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = "form-message" + (type ? " " + type + "-message" : "");
}

function validateName(name, excludeIndex = null) {
  const trimmed = name.trim();
  if (!trimmed) return "Please enter a category name.";
  if (trimmed.length > 30) return "Category names must be 30 characters or fewer.";
  if (categories.some((category, index) =>
    index !== excludeIndex && category.name.toLowerCase() === trimmed.toLowerCase()
  )) return "This category name already exists.";
  return "";
}

function readForm() {
  const name = nameInput.value.trim();
  const description = descriptionInput.value.trim();
  const rawItems = itemsInput.value.trim();
  const nameError = validateName(name, editingIndex);
  if (nameError) return { error: nameError, field: nameInput };
  if (description.length > 120) return { error: "Description is too long.", field: descriptionInput };
  if (!/^\d+$/.test(rawItems)) {
    return { error: "Item count must be a nonnegative whole number.", field: itemsInput };
  }
  const items = Number(rawItems);
  if (!Number.isSafeInteger(items) || items > 1000000) {
    return { error: "Item count must be between 0 and 1,000,000.", field: itemsInput };
  }
  return { value: { name, description, items } };
}

function resetEditor() {
  editingIndex = null;
  [nameInput, descriptionInput, itemsInput].forEach(field => field.removeAttribute("aria-invalid"));
  form.reset();
  itemsInput.value = "0";
  editorHeading.textContent = "Add a category";
  editorDescription.textContent = "Enter the details below. You can change them later.";
  saveButton.textContent = "Add category";

}

function startEdit(index) {
  const category = categories[index];
  if (!category) return;
  editingIndex = index;
  nameInput.value = category.name;
  descriptionInput.value = category.description;
  itemsInput.value = String(category.items);
  editorHeading.textContent = "Edit category";
  editorDescription.textContent = "Update the fields and save your changes.";
  saveButton.textContent = "Save changes";
  cancelButton.classList.remove("hidden");
  setMessage("");
  openEditor();
}

function submitCategory(event) {
  event.preventDefault();
  [nameInput, descriptionInput, itemsInput].forEach(field => field.removeAttribute("aria-invalid"));
  const result = readForm();
  if (result.error) {
    setMessage(result.error, "error");
    result.field.setAttribute("aria-invalid", "true");
    result.field.focus();
    return;
  }
  if (editingIndex === null && categories.length >= Data.MAX_CATEGORIES) {
    setMessage("You can save up to 1,000 categories.", "error");
    return;
  }
  const wasEditing = editingIndex !== null;
  const original = categories.slice();
  if (wasEditing) {
    categories = categories.map((category, index) => index === editingIndex ? result.value : category);
  } else {
    categories = [...categories, result.value];
  }
  if (!saveCategories()) {
    categories = original;
    return;
  }
  recordActivity(wasEditing ? "edit" : "add", result.value);
  editorDialog.close();
  resetEditor();
  updateDashboard();
  showCategories();
  setImportMessage(wasEditing ? "Category updated." : "Category added.", "success");
  setMessage(wasEditing ? "Category updated." : "Category added.", "success");
}

function deleteCategory(index) {
  const category = categories[index];
  if (!category) return;
  if (trash.length >= Data.MAX_CATEGORIES || trash.some(item => item.name.toLowerCase() === category.name.toLowerCase())) {
    setImportMessage("Restore or permanently remove the matching deleted category first. Deleted categories are limited to 1,000.", "error");
    return;
  }
  if (!confirm('Move "' + category.name + '" to Recently deleted? You can restore it later.')) return;
  const original = categories.slice();
  const oldTrash = trash.slice();
  categories = categories.filter((_, position) => position !== index);
  trash = [...trash, category];
  if (!saveCategories()) {
    categories = original;
    trash = oldTrash;
    return;
  }
  recordActivity("delete", category);
  refresh();
  revealRecovery();
  document.getElementById("deleted-heading").focus();
  setImportMessage("Category moved to Recently deleted.", "success");
  setMessage("Category moved to Recently deleted.", "success");
}

function refresh() {
  resetEditor();
  updateDashboard();
  showCategories();
  renderRecovery();
}

function restoreCategory(index) {
  const category = trash[index];
  if (categories.some(item => item.name.toLowerCase() === category.name.toLowerCase())) {
    setImportMessage("A category with this name already exists. Rename the active category before restoring.", "error");
    return;
  }
  const original = categories;
  const oldTrash = trash;
  categories = [...categories, category];
  trash = trash.filter((_, position) => position !== index);
  if (!saveCategories()) { categories = original; trash = oldTrash; return; }
  recordActivity("restore", category);
  refresh();
  document.getElementById("deleted-heading").focus();
  setImportMessage('Restored "' + category.name + '".', "success");
}

function removeForever(index) {
  if (!confirm('Permanently delete "' + trash[index].name + '"? Export a JSON backup first.')) return;
  const previous = trash;
  trash = trash.filter((_, position) => position !== index);
  if (!saveCategories()) { trash = previous; return; }
  recordActivity("purge", previous[index]);
  renderRecovery();
  document.getElementById("deleted-heading").focus();
  setImportMessage("Deleted category permanently removed. The previous save remains available until the next change.", "success");
}

function renderRecovery() {
  const list = document.getElementById("deleted-list");
  list.replaceChildren();
  document.getElementById("deleted-count").textContent = String(trash.length);
  if (!trash.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No deleted categories. Deleted entries stay here until you remove them.";
    list.append(empty);
  }
  trash.forEach(category => {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = category.name + " · " + category.items + " items";
    const actions = document.createElement("div");
    actions.className = "button-group";
    actions.append(makeButton("Restore", "edit-button", "", () => { const current = trash.indexOf(category); if (current >= 0) restoreCategory(current); }),
      makeButton("Delete permanently", "delete-button", "", () => { const current = trash.indexOf(category); if (current >= 0) removeForever(current); }));
    row.append(label, actions);
    list.append(row);
  });
}

function renderChart() {
  const chart = document.getElementById("category-chart");
  chart.replaceChildren();
  if (!categories.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No categories yet. Add one to see your chart.";
    chart.appendChild(empty);
    return;
  }
  const limit = document.getElementById("chart-limit").value;
  const plotted = categories.slice().sort((a, b) => b.items - a.items).slice(0, limit === "all" ? categories.length : 8);
  const maximum = Math.max(1, ...plotted.map(category => category.items));
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 7));
  const step = Math.max(1, [1, 2, 5, 10].find(value => value * magnitude >= maximum / 7) * magnitude);
  const ticks = Math.ceil(maximum / step);
  const ceiling = step * (ticks + 0.5);
  const wrapper = document.createElement("div");
  wrapper.className = "chart";
  wrapper.style.minWidth = (Math.max(0, plotted.length * 62) + 35) + "px";
  const axis = document.createElement("div");
  axis.className = "chart-axis";
  axis.setAttribute("aria-hidden", "true");
  const plot = document.createElement("div");
  plot.className = "chart-plot";
  const grid = document.createElement("div");
  grid.className = "chart-grid";
  grid.setAttribute("aria-hidden", "true");
  for (let index = 0; index <= ticks; index++) {
    const label = document.createElement("span");
    label.textContent = (step * index).toLocaleString();
    label.style.bottom = (index * step / ceiling * 100) + "%";
    axis.append(label);
    const line = document.createElement("span");
    line.style.bottom = (index * step / ceiling * 100) + "%";
    grid.append(line);
  }
  const columns = document.createElement("div");
  columns.className = "chart-columns";
  plotted.forEach(category => {
    const column = document.createElement("div");
    column.className = "chart-column";
    column.setAttribute("aria-label", category.name + ": " + category.items + " items");
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height = (category.items / ceiling * 100) + "%";
    const value = document.createElement("span");
    value.className = "chart-count";
    value.textContent = category.items.toLocaleString();
    bar.append(value);
    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = category.name;
    label.setAttribute("title", category.name);
    column.append(bar, label);
    columns.append(column);
  });
  plot.append(grid, columns);
  wrapper.append(axis, plot);
  chart.append(wrapper);
}

function updateDashboard() {
  const total = categories.reduce((sum, category) => sum + category.items, 0);
  const largest = categories.reduce((best, category) =>
    best === null || category.items > best.items ? category : best, null);
  document.getElementById("total-categories").textContent = String(categories.length);
  document.getElementById("total-items").textContent = total.toLocaleString();
  document.getElementById("largest-category").textContent =
    largest ? largest.name + " (" + largest.items + ")" : "None";
  document.getElementById("average-items").textContent = (categories.length ? total / categories.length : 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
  renderChart();
}

function makeButton(label, className, icon, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.innerHTML = icon;
  button.append(document.createTextNode(label));
  button.addEventListener("click", () => runExclusive(onClick));
  return button;
}

const editIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="m16 4 4 4-11 11-5 1 1-5L16 4Z"/></svg>';
const deleteIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7m4-7v7"/></svg>';

function showCategories() {
  const query = searchInput.value.trim().toLowerCase();
  const sort = sortInput.value;
  const visible = categories.filter(category =>
    category.name.toLowerCase().includes(query) ||
    category.description.toLowerCase().includes(query)
  );
  const compareNames = (a, b) => a.name.localeCompare(b.name);
  if (sort === "az") visible.sort(compareNames);
  if (sort === "za") visible.sort((a, b) => compareNames(b, a));
  if (sort === "low") visible.sort((a, b) => a.items - b.items);
  if (sort === "high") visible.sort((a, b) => b.items - a.items);
  document.getElementById("visible-count").textContent =
    visible.length + (visible.length === 1 ? " category" : " categories");
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  document.getElementById("page-summary").textContent = visible.length ? "Showing " + (start + 1) + "–" + Math.min(start + PAGE_SIZE, visible.length) + " of " + visible.length + " categories" : "0 categories";
  const pagination = document.getElementById("pagination");
  pagination.replaceChildren();
  if (pages > 1) {
    const pageButton = (label, target, name) => {
      const button = makeButton(label, "page-button", "", () => { currentPage = target; showCategories(); document.querySelector(".table-scroll").focus(); });
      button.setAttribute("aria-label", name);
      button.disabled = target < 1 || target > pages;
      if (target === currentPage) button.setAttribute("aria-current", "page");
      pagination.append(button);
    };
    pageButton("‹", currentPage - 1, "Previous page");
    const first = Math.max(1, Math.min(currentPage - 1, pages - 2));
    for (let page = first; page <= Math.min(pages, first + 2); page++) pageButton(String(page), page, "Page " + page);
    pageButton("›", currentPage + 1, "Next page");
  }
  categoryList.replaceChildren();
  if (!visible.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.setAttribute("colspan", "5");
    cell.className = "empty-state";
    cell.textContent = categories.length ? "No matching categories. Try another search." : "No categories yet. Add your first category using Add Category.";
    row.append(cell);
    categoryList.append(row);
    return;
  }
  visible.slice(start, start + PAGE_SIZE).forEach(category => {
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.setAttribute("scope", "row");
    const titleWrap = document.createElement("div");
    titleWrap.className = "category-title";
    const symbol = document.createElement("span");
    symbol.className = "category-symbol";
    symbol.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7.5" cy="7.5" r="1"/></svg>';
    const title = document.createElement("h3");
    title.textContent = category.name;
    titleWrap.append(symbol, title);
    name.append(titleWrap);
    const description = document.createElement("td");
    description.className = "category-description";
    description.textContent = category.description || "No description";
    const count = document.createElement("td");
    count.className = "item-count";
    count.textContent = category.items.toLocaleString();
    const updated = document.createElement("td");
    updated.className = "updated-cell";
    const at = activity.updated(category);
    updated.textContent = at ? formatDate(at) : "Not recorded";
    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "category-actions";
    actions.append(
      makeButton("Edit", "edit-button", editIcon, () => startEdit(categories.indexOf(category))),
      makeButton("Delete", "delete-button", deleteIcon, () => deleteCategory(categories.indexOf(category)))
    );
    actionCell.append(actions);
    row.append(name, description, count, updated, actionCell);
    categoryList.appendChild(row);
  });
}

function download(content, filename, type) {
  try {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (error) {
    setImportMessage("Download could not be created. " + error.message, "error");
  }
}
function exportCsv() {
  if (store.blocked) { setImportMessage("Saved data is unreadable. Use Download stored data under Data recovery to preserve the original bytes.", "error"); return; }
  download(Data.toCsv(categories), "categories.csv", "text/csv;charset=utf-8");
}
function exportJson() {
  if (store.blocked) { setImportMessage("Saved data is unreadable. Use Download stored data under Data recovery to preserve the original bytes.", "error"); return; }
  if (download(Data.serialize({ version: 1, categories, trash }), "category-dashboard-backup.json", "application/json")) recordActivity("backup");
}
function exportRaw() {
  try {
    download(JSON.stringify({ current: storage.getItem(Data.KEY), legacy: storage.getItem(Data.LEGACY_KEY), previous: storage.getItem(Data.PREVIOUS_KEY) }, null, 2),
      "category-dashboard-recovery.json", "application/json");
  } catch (error) { setImportMessage("Stored data is inaccessible. " + error.message, "error"); }
}

function setImportMessage(text, type = "") {
  const status = document.getElementById("import-message");
  status.textContent = text;
  status.className = "form-message" + (type ? " " + type + "-message" : "");
}

let importing = false;
async function importFile(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  input.value = "";
  if (!file || importing) return;
  if (file.size > Data.MAX_FILE_BYTES) {
    setImportMessage("File must be no larger than 1 MB.", "error");
    return;
  }
  importing = true;
  setImportMessage("Reading file…");
  const beforeRead = store.raw;
  try {
    const text = await file.text();
    if (beforeRead !== store.raw) throw new Error("Data changed while reading the file. Please import again.");
    const isJson = /\.json$/i.test(file.name) || text.trimStart().startsWith("{");
    const imported = isJson ? Data.parseJson(text) : { version: 1, categories: Data.validateCategories(Data.parseBackup(text)), trash };
    if (!confirm("Replace active categories with " + imported.categories.length +
      " imported categories? " + (isJson ? "Recently deleted will also be replaced. " : "Recently deleted will be kept. ") +
      "Your current data is kept as the previous save.")) {
      setImportMessage("Import cancelled.");
      return;
    }
    const commitImport = () => {
      if (beforeRead !== store.raw) throw new Error("Data changed while importing. Please import again.");
      return store.commit(imported);
    };
    await (window.navigator && window.navigator.locks
      ? window.navigator.locks.request(Data.KEY, commitImport)
      : commitImport());
    categories = store.state.categories;
    trash = store.state.trash;
    searchInput.value = "";
    sortInput.value = "default";
    document.getElementById("global-search").value = "";
    currentPage = 1;
    recordActivity("import");
    refresh();
    setMessage("");
    setImportMessage("Imported " + categories.length + " categories. You can restore the previous save below.", "success");
  } catch (error) {
    setImportMessage("Import failed. Nothing was replaced. " + error.message, "error");
  } finally { importing = false; }
}

function recoverPrevious() {
  try {
    const previous = store.previous();
    if (!confirm("Restore the previous save (" + previous.categories.length + " active categories)? Current stored data will become the previous save.")) return;
    store.recover();
    recordActivity("recover");
    categories = store.state.categories;
    trash = store.state.trash;
    refresh();
    document.getElementById("storage-warning").textContent = "";
    setImportMessage("Previous save restored.", "success");
  } catch (error) { setImportMessage("Recovery failed. " + error.message, "error"); }
}

function loadTheme() {
  try {
    if (storage.getItem(THEME_KEY) !== "light") {
      document.body.classList.add("dark-mode");
    }
  } catch (error) {
    console.warn("Theme preference is unavailable.", error);
  }
  updateThemeButton();
}

function updateThemeButton() {
  const isDark = document.body.classList.contains("dark-mode");
  const button = document.getElementById("background-button");
  button.textContent = isDark ? "Light mode" : "Dark mode";
  button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  try {
    storage.setItem(
      THEME_KEY,
      document.body.classList.contains("dark-mode") ? "dark" : "light"
    );
  } catch (error) {
    setImportMessage("Theme changed for this tab, but the preference could not be saved.", "error");
  }
  updateThemeButton();
}

form.addEventListener("submit", event => {
  event.preventDefault();
  saveButton.disabled = true;
  form.setAttribute("aria-busy", "true");
  Promise.resolve(runExclusive(() => submitCategory(event))).finally(() => {
    saveButton.disabled = false;
    form.setAttribute("aria-busy", "false");
  });
});
cancelButton.addEventListener("click", () => {
  editorDialog.close();
  resetEditor();
  setMessage("");
});
searchInput.addEventListener("input", () => { currentPage = 1; document.getElementById("global-search").value = searchInput.value; showCategories(); });
sortInput.addEventListener("change", () => { currentPage = 1; showCategories(); });
document.getElementById("global-search").addEventListener("input", event => { currentPage = 1; searchInput.value = event.target.value; showCategories(); });
document.getElementById("global-search").addEventListener("keydown", event => { if (event.key === "Enter") { document.getElementById("categories").scrollIntoView(); searchInput.focus(); } });
document.getElementById("chart-limit").addEventListener("change", renderChart);
document.getElementById("add-category-button").addEventListener("click", () => { resetEditor(); setMessage(""); openEditor(); });
document.getElementById("close-editor").addEventListener("click", () => editorDialog.close());
editorDialog.addEventListener("close", () => { if (!editorDialog.open) { resetEditor(); setMessage(""); } });
document.getElementById("activity-toggle").addEventListener("click", () => {
  showAllActivity = !showAllActivity;
  document.querySelector(".activity-panel").classList.toggle("expanded");
  renderActivity();
});
document.getElementById("import-button").addEventListener("click", () =>
  document.getElementById("import-file").click()
);
document.getElementById("import-file").addEventListener("change", importFile);
document.getElementById("export-button").addEventListener("click", exportCsv);
document.getElementById("background-button").addEventListener("click", toggleTheme);

document.getElementById("backup-button").addEventListener("click", () => runExclusive(exportJson));
document.getElementById("raw-backup-button").addEventListener("click", exportRaw);
document.getElementById("recover-button").addEventListener("click", () => runExclusive(recoverPrevious));
window.addEventListener("storage", event => {
  if (event.key === Data.KEY || event.key === Data.LEGACY_KEY || event.key === null) {
    document.getElementById("storage-warning").textContent = "Storage changed in another tab. Export this view if needed, then reload before making changes.";
  }
});
if (store.blocked) document.getElementById("storage-warning").textContent = store.error;
loadTheme();
updateDashboard();
showCategories();
renderRecovery();

renderActivity();
