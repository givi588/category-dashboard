const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');
const KEY = 'category-dashboard:v1';
const fixture = { version: 1, categories: [{ name: 'Café', description: "'@literal\nQuoted, \"text\"", items: 8 }], trash: [{ name: 'Deleted', description: '', items: 2 }] };
async function add(page, name = 'Books', items = '8', description = 'Novels') {
  await page.getByLabel('Category name').fill(name);
  await page.getByLabel('Description', { exact: true }).fill(description);
  await page.getByLabel('Number of items').fill(items);
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
}
async function upload(page, text, name = 'backup.json') {
  await page.locator('#import-file').setInputFiles({ name, mimeType: name.endsWith('.csv') ? 'text/csv' : 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('#import-message')).toContainText(/Imported|Import cancelled|Import failed/);
}
function acceptNext(page) { page.once('dialog', dialog => dialog.accept()); }
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.__errors = errors;
  await page.goto('/');
});
test.afterEach(async ({ page }) => { expect(page.__errors).toEqual([]); });

test('CRUD, Enter submission, persisted deletion and restoration', async ({ page }) => {
  await page.getByLabel('Category name').fill('Books');
  await page.getByLabel('Number of items').fill('8');
  await page.getByLabel('Category name').press('Enter');
  await expect(page.locator('#total-items')).toHaveText('45');
  let row = page.locator('#category-list li').filter({ hasText: 'Books' });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Number of items').fill('10');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('#total-items')).toHaveText('47');
  acceptNext(page);
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('#deleted-count')).toHaveText('1');
  await page.reload();
  await expect(page.locator('#deleted-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.locator('#total-items')).toHaveText('47');
  await expect(page.locator('#deleted-count')).toHaveText('0');
});
test('validation, cancellation, search and all sort modes', async ({ page }) => {
  await add(page, 'gaming');
  await expect(page.getByLabel('Category name')).toHaveAttribute('aria-invalid', 'true');
  await add(page, 'Books', '-1');
  await expect(page.getByLabel('Number of items')).toHaveAttribute('aria-invalid', 'true');
  await add(page, 'Books', '0');
  await page.getByLabel('Search', { exact: true }).fill('novels');
  await expect(page.locator('#visible-count')).toHaveText('1 category');
  await page.getByLabel('Search', { exact: true }).fill('absent');
  await expect(page.locator('#category-list')).toContainText('No matching categories');
  await page.getByLabel('Search', { exact: true }).fill('');
  for (const [mode, first] of [['az', 'Books'], ['za', 'Sport'], ['low', 'Books'], ['high', 'Gaming'], ['default', 'Gaming']]) {
    await page.getByLabel('Sort by').selectOption(mode);
    await expect(page.locator('#category-list h3').first()).toHaveText(first);
  }
  await page.locator('#category-list li').first().getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Category name').fill('Unsaved');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#category-list li').first().getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('#category-list h3').first()).toHaveText('Gaming');
});
test('JSON download and upload round trip with trash and exact Unicode', async ({ page }) => {
  acceptNext(page);
  await upload(page, JSON.stringify(fixture));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up JSON' }).click();
  const download = await downloadPromise;
  expect(JSON.parse(await fs.readFile(await download.path(), 'utf8'))).toEqual(fixture);
  await page.reload();
  await expect(page.locator('#category-list h3')).toHaveText('Café');
  await expect(page.locator('#deleted-count')).toHaveText('1');
  await page.getByText('Data recovery', { exact: true }).click();
  acceptNext(page);
  await page.getByRole('button', { name: 'Restore previous save' }).click();
  await expect(page.locator('#total-items')).toHaveText('37');
});
test('CSV export, actual file import, invalid file and cancellation', async ({ page }) => {
  await add(page, 'Books', '8', 'Mystery, "classic"\nNotes');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  const csv = await fs.readFile(await download.path(), 'utf8');
  expect(csv).toContain('"Mystery, ""classic""\nNotes"');
  acceptNext(page);
  await upload(page, csv, 'categories.csv');
  await expect(page.locator('#total-items')).toHaveText('45');
  await upload(page, 'name,description,items\nBad,,-3', 'bad.csv');
  await expect(page.locator('#import-message')).toContainText('Nothing was replaced');
  page.once('dialog', dialog => dialog.dismiss());
  await upload(page, JSON.stringify(fixture));
  await expect(page.locator('#total-items')).toHaveText('45');
  await expect(page.locator('#import-message')).toContainText('cancelled');
});
test('legacy migration preserves original bytes and empty data', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('categories', '[{"name":"Legacy","description":"Original","items":5}]'));
  await page.reload();
  await expect(page.locator('#total-items')).toHaveText('5');
  await add(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('categories'))[0].name)).toBe('Legacy');
  await page.evaluate(key => { localStorage.removeItem(key); localStorage.setItem('categories', '[]'); }, KEY);
  await page.reload();
  await expect(page.locator('#total-categories')).toHaveText('0');
});
test('corrupt storage is not overwritten and recovery preserves raw bytes', async ({ page }) => {
  await page.evaluate(({ key, fixture }) => { localStorage.setItem(key, '{broken'); localStorage.setItem('category-dashboard:previous', JSON.stringify(fixture)); }, { key: KEY, fixture });
  await page.reload();
  await expect(page.locator('#storage-warning')).toContainText('not been overwritten');
  await add(page);
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe('{broken');
  await page.getByText('Data recovery', { exact: true }).click();
  acceptNext(page);
  await page.getByRole('button', { name: 'Restore previous save' }).click();
  await expect(page.locator('#total-items')).toHaveText('8');
  expect(await page.evaluate(() => localStorage.getItem('category-dashboard:previous'))).toBe('{broken');
});
test('quota failure has no false success or UI mutation', async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await add(page);
  await expect(page.locator('#category-message')).toContainText('not saved');
  await expect(page.locator('#total-items')).toHaveText('37');
});
test('stale tab warns and cannot overwrite newer categories', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/');
  await add(page, 'First tab');
  await expect(other.locator('#storage-warning')).toContainText('another tab');
  await add(other, 'Second tab');
  await expect(other.locator('#category-message')).toContainText('another tab');
  await other.reload();
  await expect(other.locator('#category-list')).toContainText('First tab');
  await expect(other.locator('#category-list')).not.toContainText('Second tab');
});
test('untrusted imported markup is rendered as text', async ({ page }) => {
  acceptNext(page);
  await upload(page, JSON.stringify({ version: 1, categories: [{ name: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>', items: 0 }], trash: [] }));
  await expect(page.locator('#category-list h3')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#category-list img, #category-list script')).toHaveCount(0);
});
test('theme persists and keyboard skip link works', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to dashboard' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
});
for (const width of [320, 360, 768, 1280]) {
  test(`layout and automated accessibility at ${width}px in both themes`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(results.violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${width}-${theme}.png`), fullPage: true });
    }
  });
}

test('permanent deletion and empty-state import can be undone with previous save', async ({ page }) => {
  acceptNext(page);
  await page.locator('#category-list li').first().getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('#deleted-count')).toHaveText('1');
  acceptNext(page);
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.locator('#deleted-count')).toHaveText('0');
  await page.getByText('Data recovery', { exact: true }).click();
  acceptNext(page);
  await page.getByRole('button', { name: 'Restore previous save' }).click();
  await expect(page.locator('#deleted-count')).toHaveText('1');
  acceptNext(page);
  await upload(page, JSON.stringify({ version: 1, categories: [], trash: [] }));
  await page.reload();
  await expect(page.locator('#total-categories')).toHaveText('0');
  await expect(page.locator('#category-chart')).toContainText('No categories yet');
});
