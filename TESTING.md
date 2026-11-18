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

## Dashboard 2.0 verification

- Local `npm ci`, `npm run check`, `npm test` (38 tests), and `npm run build` pass.
- New browser regressions cover mobile menu keyboard/anchor/Escape behavior and unchanged saved bytes through navigation and theme changes.
- The existing four-width, two-theme accessibility/screenshot matrix remains in place.
- Local Playwright downloads returned invalid archives; system Chromium cannot launch because this environment blocks its required socket operation. The full suite subsequently passed in GitHub Actions.
- Tests use isolated browser contexts; no live user browser storage is accessed.
- [Verified Actions run](https://github.com/givi588/category-dashboard/actions/runs/44181480802): **38 unit tests and 51 browser tests passed**, across Chromium, Firefox and WebKit. All four requested widths passed overflow and automated WCAG A/AA scans in both themes.
- Real desktop and mobile captures in `screenshots/v2-*` were downloaded from that run and visually reviewed.
- Browser review found and resolved the local navigation script route and transient contrast loss during theme switching. Background theme transitions were removed rather than weakening the accessibility assertions.
- Remaining limits: automated accessibility is not a complete manual assistive-technology audit; browser-local data does not synchronize across devices.

## Dashboard 2.1 verification — 2026-11-18

The review branch is `feature/dashboard-v2-1-visual`; production remains unchanged. All data used below is synthetic and isolated from users' saved browser data.

- `npm ci`, `npm run check`, `npm test` (**43 tests**) and `npm run build` pass locally.
- Local browser execution is blocked by the workspace's Chromium socket restriction. The actual three-engine browser suite runs in the version-matched Playwright container on GitHub Actions.
- The final implementation is covered by **63 browser scenarios** (21 each in Chromium, Firefox and WebKit). This includes the original CRUD, validation, search/sort, persistence, CSV/JSON download/upload, deleted recovery, previous-save recovery, corruption/quota handling, stale-tab and untrusted-text cases.
- New checks cover native modal cancellation, explicit Tab/Shift+Tab wrapping and focus restoration; rapid sequential saves with Web Locks; five-row pagination; synchronized global search; truthful update timestamps; retained activity; and successful category saves with unreadable activity history.
- The entire browser suite asserts no uncaught page errors or console errors.
- Default inventory and the reference-comparison fixture both receive overflow and axe WCAG A/AA checks at **320, 375, 768 and 1440 px**, in **light and dark themes**, across all three engines. Modal accessibility is checked separately.
- The reference fixture is imported through the actual file input and edited through the actual modal. Screenshots show computed metrics and genuine events from those test actions. They are not a snapshot of the owner's live inventory.
- The saved-byte regression verifies that opening the redesign, navigating and changing theme preserve the primary category, previous-save and legacy values exactly. `data.js` is unchanged from main. Five new unit tests exercise the optional history's read-only initialization, exact snapshot timestamps, bounded history, corruption/future-version preservation and quota failure.
- Screenshot review prompted two visual corrections: tighter table/heading proportions and readable chart ticks, followed by extra room above chart values and better activity spacing. An accessibility scan's scroll position is normalized before screenshots so fixed/sticky navigation is captured at the page top.

Evidence: [browser workflow](https://github.com/givi588/category-dashboard/actions/runs/44287927590), [visual review and screenshots](docs/VISUAL-REVIEW-v2.1.md), and [pull request #2](https://github.com/givi588/category-dashboard/pull/2).

Remaining limits: automated accessibility does not replace a manual screen-reader audit; viewport emulation does not replace physical-device testing. No hosted branch preview is configured. The PR must remain unmerged and production must remain unchanged until the owner approves the design.
