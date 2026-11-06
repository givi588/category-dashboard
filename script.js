"use strict";

const Data = globalThis.DashboardData;
const THEME_KEY = "theme";
// Access to localStorage itself can throw in restricted browsing contexts.
let storage;
try { storage = window.localStorage; } catch (error) {
  storage = { getItem() { throw error; }, setItem() { throw error; } };
}
const store = new Data.Store(storage);

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
  cancelButton.classList.add("hidden");
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
  nameInput.focus();
  document.querySelector(".editor-panel").scrollIntoView({ behavior: "auto", block: "nearest" });
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
  resetEditor();
  updateDashboard();
  showCategories();
  setMessage(wasEditing ? "Category updated." : "Category added.", "success");
}

function deleteCategory(index) {
  const category = categories[index];
  if (!category) return;
  if (trash.length >= Data.MAX_CATEGORIES || trash.some(item => item.name.toLowerCase() === category.name.toLowerCase())) {
    setMessage("Restore or permanently remove the matching deleted category first. Deleted categories are limited to 1,000.", "error");
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
  refresh();
  document.getElementById("deleted-heading").focus();
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
  refresh();
  document.getElementById("deleted-heading").focus();
  setImportMessage('Restored "' + category.name + '".', "success");
}

function removeForever(index) {
  if (!confirm('Permanently delete "' + trash[index].name + '"? Export a JSON backup first.')) return;
  const previous = trash;
  trash = trash.filter((_, position) => position !== index);
  if (!saveCategories()) { trash = previous; return; }
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
  const maximum = Math.max(1, ...categories.map(category => category.items));
  categories.forEach(category => {
    const row = document.createElement("div");
    row.className = "chart-row";
    const label = document.createElement("div");
    label.className = "chart-label";
    const name = document.createElement("span");
    name.textContent = category.name;
    const count = document.createElement("span");
    count.textContent = category.items + " items";
    label.append(name, count);
    const track = document.createElement("div");
    track.className = "chart-track";
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.width = (category.items / maximum * 100) + "%";
    track.appendChild(bar);
    row.append(label, track);
    chart.appendChild(row);
  });
}

function updateDashboard() {
  const total = categories.reduce((sum, category) => sum + category.items, 0);
  const largest = categories.reduce((best, category) =>
    best === null || category.items > best.items ? category : best, null);
  document.getElementById("total-categories").textContent = String(categories.length);
  document.getElementById("total-items").textContent = total.toLocaleString();
  document.getElementById("largest-category").textContent =
    largest ? largest.name + " (" + largest.items + ")" : "None";
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
  categoryList.replaceChildren();
  if (!visible.length) {
    const row = document.createElement("li");
    row.className = "empty-state";
    row.textContent = categories.length ? "No matching categories. Try another search." : "No categories yet. Add your first category using the form.";
    categoryList.appendChild(row);
    return;
  }
  visible.forEach(category => {
    const row = document.createElement("li");
    const title = document.createElement("h3");
    title.textContent = category.name;
    const description = document.createElement("p");
    description.className = "category-description";
    description.textContent = category.description || "No description";
    const count = document.createElement("span");
    count.className = "item-count";
    count.textContent = category.items + " items";
    const actions = document.createElement("div");
    actions.className = "category-actions";
    actions.append(
      makeButton("Edit", "edit-button", editIcon, () => startEdit(categories.indexOf(category))),
      makeButton("Delete", "delete-button", deleteIcon, () => deleteCategory(categories.indexOf(category)))
    );
    row.append(title, description, count, actions);
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
  download(Data.serialize({ version: 1, categories, trash }), "category-dashboard-backup.json", "application/json");
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
    categories = store.state.categories;
    trash = store.state.trash;
    refresh();
    document.getElementById("storage-warning").textContent = "";
    setImportMessage("Previous save restored.", "success");
  } catch (error) { setImportMessage("Recovery failed. " + error.message, "error"); }
}

function loadTheme() {
  try {
    if (storage.getItem(THEME_KEY) === "dark") {
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
  runExclusive(() => submitCategory(event));
});
cancelButton.addEventListener("click", () => {
  resetEditor();
  setMessage("");
});
searchInput.addEventListener("input", showCategories);
sortInput.addEventListener("change", showCategories);
document.getElementById("import-button").addEventListener("click", () =>
  document.getElementById("import-file").click()
);
document.getElementById("import-file").addEventListener("change", importFile);
document.getElementById("export-button").addEventListener("click", exportCsv);
document.getElementById("background-button").addEventListener("click", toggleTheme);

document.getElementById("backup-button").addEventListener("click", exportJson);
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
