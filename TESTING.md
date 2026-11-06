# Verification record — v1.0

Tested against isolated synthetic data. No production user browser data was read or modified.

## Local checks, 2026-11-05

- `npm run check`: JavaScript syntax checks passed.
- `npm test`: 38 tests passed, zero failures/skips (Node 24.22.1).
- `npm run build`: deployable static files generated successfully.
- `npm audit --json`: zero reported vulnerabilities, including development dependencies, at the time of the audit. This is not a guarantee against future advisories.
- `git diff --check`: no whitespace errors.

Node tests cover the original 17 scenarios plus persistent trash restoration, duplicate restores, cancelled/invalid/oversized imports, exact JSON round trips, legacy migration and empty data, corrupt/future-version states, backup and primary quota failures, stale tabs, recovery of corrupt bytes, parser limits and non-destructive validation. Simulated DOM tests do not prove browser behavior.

## Interactive Chrome preview

Performed through the actual application UI on the private development preview:

- Add a category containing a Unicode description; verify totals.
- Edit its count, reload, and verify the saved value.
- Confirm a deletion, reload, restore the category, and verify totals.
- Search by Unicode description and verify the filtered list.
- Switch to dark mode, reload, and verify theme persistence; visually inspect desktop layout.
- Download a real JSON backup and inspect the resulting file for exact Unicode text and counts.
- Import that downloaded file through the file chooser and confirm restoration of the expected four categories / 46 items.
- Exercise saving with Web Locks enabled after the concurrency improvement.

## Browser CI

The Playwright suite runs 15 scenarios in each of Chromium, Firefox and WebKit (45 total). It includes actual file downloads/uploads, persistence, confirmations/cancellation, corruption/quota injection, cross-tab conflicts, XSS-as-text rendering, keyboard skip navigation, and permanent-delete/empty-state recovery. Four layout cases scan both light and dark modes at 320, 360, 768 and 1280 px with axe WCAG A/AA tags and save full-page screenshots.

The browser tests wait for explicit completion feedback during asynchronous file reads, dialogs and Web Locks. The current clean repository's [GitHub Actions check](https://github.com/givi588/category-dashboard/actions/runs/42250453180) passed successfully. The workflow includes all 38 Node tests and 45 browser scenarios across Chromium, Firefox and WebKit.

All 24 automated accessibility scans (three engines × four widths × two themes) reported zero violations for the configured WCAG A/AA tags. The four responsive scenarios passed in each engine without horizontal overflow. Full-page 320px light and 1280px dark screenshots were additionally inspected visually. Repository screenshots are from the same v1 layout in the initial run's successful responsive cases.

An earlier run stalled while Ubuntu downloaded OS dependencies. CI now uses the version-matched official Playwright container, with browsers and dependencies already installed.

## Remaining verification limits

- Automated axe checks are not a full WCAG audit; no manual NVDA, VoiceOver or TalkBack assessment has been performed.
- Responsive tests emulate viewport sizes; no physical iOS/Android device testing has been performed. WebKit on Linux is not the Safari app on an iPhone.
- Exported CSV has not been opened in actual Excel/LibreOffice. Formula escaping and emitted bytes are tested; use JSON for exact backups.
- Quota/permission failures are simulated, not tests against every browser's real disk-full/private-browsing policy.
- localStorage and its previous snapshot are not a durable remote backup. Clearing origin data removes them.
- Web Locks coordinates participating app tabs on supported secure origins. Fallback storage comparisons do not provide a database transaction or serialize unrelated scripts.
