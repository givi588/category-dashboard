# v1.0 technical audit and implementation report

Date: 2026-11-05. Repository: `givi588/my-first-website`. Baseline: `7b01b04a2b41d7ee96ca4c2cc67267ec6db1f1c9`. Work prepared on `release/portfolio-v1`, reviewed through PR #4, with main left unchanged during implementation/testing.

## Findings and changes

| Area | Baseline issue | v1.0 behavior |
| --- | --- | --- |
| Persistence | Invalid saved JSON silently fell back to examples; subsequent changes could overwrite original data | Read-only failure state, visible warning, original bytes retained, diagnostic raw download and explicit snapshot recovery |
| Migration | All operations wrote the generic `categories` key | Namespaced/versioned storage; original legacy key never rewritten; migration occurs on first successful mutation |
| Recovery | Confirmed deletion was irreversible | Persistent Recently deleted, individual restore, confirmed permanent removal and a previous-save snapshot |
| Failed writes | Form rollback existed, but no recovery snapshot or cross-tab protection | Validate → compare current version → preserve previous → commit; state/feedback only update after success |
| Multiple tabs | Stale tabs could overwrite newer data | Web Locks around participating writers and a stale-value comparison; external changes produce a warning |
| Fast repeated actions | Array indexes become unsafe when asynchronous operations shift the list | Action callbacks resolve the category object at execution; queued duplicate deletion is regression-tested |
| CSV round trip | Export-added apostrophes were inconsistently decoded; original literal prefixes could be lost | CSV remains a safe spreadsheet report; import preserves literal text; JSON is the documented exact backup format |
| JSON | No lossless backup including deleted data | Versioned validated JSON import/export, containing active and deleted lists |
| Validation | Stored description lengths, duplicate names, and manual category capacity were inconsistent | Shared validation for all persisted/imported states; bounded names, descriptions, counts, lists and file sizes |
| User feedback | Some failures were console-only; imports had no reading feedback | Explicit storage/import/theme-save messages, reading state, invalid-field attributes and focus |
| Accessibility | No skip link, generic chart naming, faint field boundaries | Skip navigation, named chart group, stronger field-border contrast, live status and deliberate recovery focus |
| Descriptions | Single-line input could discard imported multiline content during editing | Multiline textarea, with the same length limit |
| Testing | 17 simulated-DOM tests, no real-browser automation | 38 Node cases plus 45 browser cases across Chromium, Firefox and WebKit |
| CI | Only a Node test command | Syntax checks, locked dependency installation, build, browser and axe tests, uploaded reports/traces/screenshots, test-gated v1.0 release |
| Documentation | Future-work checklist, limited recovery guidance | README, DATA.md, TESTING.md, this audit and release notes; actual screenshots |

## Security review

Category text is rendered using `textContent`, never interpreted as HTML. The only `innerHTML` use is developer-owned static SVG icon markup. Browser tests import hostile-looking HTML and verify that no image/script nodes are created. The data layer projects permitted fields into new objects and rejects malformed/future-version data. No third-party scripts, network data API, account system, tracking or secrets are introduced. CSV export neutralizes formula-like values; exact backups use JSON.

This app has no authentication boundary and does not encrypt localStorage. Scripts on the same origin can read it. It is suitable for personal category data, not confidential records. GitHub Pages hosting/security configuration was not widened. CI test jobs have read-only repository permissions; only the gated release job has contents-write permission.

`npm audit --json` returned zero known vulnerabilities on the audit date, including development dependencies. The dependency versions and official Playwright image are fixed for reproducible execution; they still need periodic maintenance.

## Verification evidence

See [TESTING.md](../TESTING.md) for exact commands, run links, executed interactive checks, counts and limitations. The passing application run is [42078322448](https://github.com/givi588/my-first-website/actions/runs/42078322448): **38/38 Node and 45/45 browser tests**, no skips or retries. The PR event run also passed.

The initial browser run passed 42/45; three harness failures were traced to not waiting for asynchronous dialog/file/lock completion. Tests were corrected to wait for visible completion rather than time-based sleeps. A separate queued-action identity regression was added during review. Earlier apt-based setup stalled on Ubuntu mirror downloads; a version-matched official Playwright container resolved the setup problem. These unsuccessful runs are not counted as passes.

## Release and deployment process

The final branch is checked before merge. Main triggers the same checks again; only a successful main test job may create `v1.0.0` and upload a static ZIP. Existing releases are never overwritten by this workflow. GitHub Pages continues to use the existing public URL and root static files. No origin/path migration is introduced, so browser storage remains at the existing origin.

A source rollback is possible through Git, but rolling the app back to the old implementation would read the untouched legacy key and would not understand new v1 edits. Export JSON before a rollback, and prefer fixing forward rather than downgrading the data-aware application.

## Explicit remaining limits

- Browser-local data only; no device synchronization, remote backups, encryption, or unlimited history.
- One previous snapshot; persistent trash until manually removed. Clearing site data removes both.
- JSON is the exact backup format. CSV formula prefixes may remain visible on re-import and can push an already maximal field over its limit.
- 1,000 active + 1,000 deleted entries, 1 MB serialized/import limit; render cost grows with the list size.
- Web Locks requires support and a secure context. Fallback compare-before-write is not an atomic database transaction; old/unrelated scripts do not participate.
- No physical mobile-device, manual screen-reader or actual Excel/LibreOffice testing. Automated WCAG checks are not a full accessibility certification.
- No service worker: an already open page can work offline, but offline navigation is not guaranteed.
- App source permissions and CI are audited; unrelated repository/account security settings and other GitHub Pages projects were outside scope.
