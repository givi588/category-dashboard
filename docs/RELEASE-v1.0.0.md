# Category Dashboard v1.0.0

A completed vanilla JavaScript portfolio dashboard with safer local data handling and a restrained responsive interface.

## Changes

- Separate shared data validation, storage and file codecs from DOM interactions.
- Preserve the original `categories` key during versioned migration.
- Block silent overwrites on corrupt storage, quota errors and stale-tab saves.
- Persist Recently deleted and restore individual categories after reload.
- Keep one previous save and provide explicit snapshot recovery and raw-data downloads.
- Add lossless JSON backups of active and deleted categories.
- Retain formula-neutralized CSV reports with strict, non-destructive import validation.
- Improve keyboard focus, skip navigation, invalid-field feedback and multiline descriptions.
- Add automated Node and Chromium/Firefox/WebKit regression checks and mobile/theme accessibility scans.
- Document data formats, migration, recovery, test evidence and known limitations.

## Installation

Use the [public dashboard](https://givi588.github.io/category-dashboard/), or download the deployable static files from the repository and serve them using any HTTP server. No runtime dependencies or account setup are needed.

## Existing users

The original local data is read without being changed. The first successful edit writes the new versioned state and keeps a previous snapshot. Export JSON regularly; browser storage and recovery copies disappear if you clear site data. CSV is a spreadsheet format, not a lossless backup. Use one editing tab; there is no cross-device sync, encryption, or unlimited history.

See [TESTING.md](../TESTING.md) and the repository's [GitHub Actions runs](https://github.com/givi588/category-dashboard/actions) for executed checks and limitations. Passing automated accessibility checks is not a full manual assistive-technology audit.
