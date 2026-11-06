# Data, backups and recovery

## Storage contract

| Key | Purpose |
| --- | --- |
| `categories` | Original array format. Read on first load only when the v1 key is absent; never written or deleted by v1. |
| `category-dashboard:v1` | Current versioned JSON: `{ "version": 1, "categories": [...], "trash": [...] }` |
| `category-dashboard:previous` | Exact previous v1 payload (or validated pre-migration state) before a change |
| `theme` | Existing `light` / `dark` preference |

Each category contains `name` (string), `description` (string), and `items` (integer). Extra fields are discarded on validation. Future schema versions are rejected rather than guessed. Legacy records outside current limits are preserved but editing is blocked until recovered; they are not silently filtered or truncated.

Loading never writes category data. Missing data starts with three examples; a saved empty array remains empty. Malformed/inaccessible storage displays a recovery warning and an empty view, without inserting examples over the user's data. An empty view in this state is **not** evidence that the original data is gone.

Before writing, the app validates the complete next state, checks for a stale saved value, stores the previous value, then writes the new value. In-memory state and success feedback change only after a successful save. If saving the previous copy fails, the mutation is aborted. If the primary write fails, the previous copy may have been refreshed, but active stored data is unchanged. Storage is synchronous; the two writes are not a database transaction.

## JSON: exact backups

**Back up JSON** downloads active categories and Recently deleted, including quotes, Unicode, newlines, and literal leading apostrophes. Import validates the entire file before asking permission to replace both lists. It saves the pre-import state for recovery. Theme preference and prior recovery snapshots are not included.

A valid v1 backup looks like:

```json
{
  "version": 1,
  "categories": [{ "name": "Books", "description": "Novels", "items": 8 }],
  "trash": []
}
```

## CSV: spreadsheet reports

CSV columns are exactly `name,description,items`, in that order. Quoted commas, escaped quotes, embedded newlines, CRLF and UTF-8 BOM are supported. Invalid headers, duplicates, noninteger/out-of-range counts, invalid quoting, overlong fields, and more than 1,000 records are rejected. Import replaces active categories and keeps Recently deleted.

Export quotes every field and prefixes formula-like text with an apostrophe. CSV import deliberately **does not strip apostrophes**: it cannot distinguish an export-added prefix from the user's original text. A formula-like name or description can therefore change on CSV re-import; a field already at its length limit may become too long after prefixing. Use JSON for exact round trips. Old CSV exports with apostrophe prefixes remain readable but those prefixes remain literal text. Formula neutralization reduces spreadsheet risk; behavior after editing/re-saving in third-party spreadsheet software is outside the app's control.

## Recovery

- **Recently deleted → Restore** returns a category to the end of the active list. Deletions persist across reloads and have no expiry timer.
- Restore is blocked if the active list already has the same case-insensitive name. Rename the active category first.
- Deleting an active category is blocked if trash already contains that name or is full. Restore/rename the existing entry or export it before permanently removing it.
- **Delete permanently** asks for confirmation. The immediate previous save can undo this until another successful change replaces that snapshot.
- **Restore previous save** swaps the current and previous snapshots. It also works when the current snapshot is corrupt but the previous one is valid; corrupt bytes are retained as the previous snapshot.
- **Download stored data** captures current, original legacy, and previous raw strings in a recovery JSON file. This diagnostic wrapper is not a normal import file. Work on a copy, extract/repair a valid v1 object, then use normal import when storage is healthy. Do not clear site data before preserving raw copies.
- If both current and previous snapshots are invalid, the app refuses writes. Manual recovery of the downloaded data and browser storage is required; the UI deliberately offers no destructive reset shortcut.

The previous save is **one step**, not an unlimited history. JSON exports are the durable backup. Do not store confidential data: localStorage is unencrypted and readable by other scripts on the same origin. GitHub Pages projects on the same `givi588.github.io` origin share localStorage even when their paths differ; the v1 keys are namespaced, while the old `categories`/`theme` keys were generic.

## Multiple tabs

A `storage` event warns about external changes; saves compare the raw value with the value loaded by that tab. Stale tabs cannot silently overwrite an already-observed newer save. Export the stale view if useful, then reload. On supported secure origins, Web Locks serializes writers from this app across tabs; the stale-value check runs inside the lock. When Web Locks is unavailable, localStorage has no atomic compare-and-swap, so perfectly simultaneous writes cannot be fully serialized. Older versions or unrelated scripts do not participate in this lock. Prefer one editing tab. Offline use means an already loaded page can keep working; there is no service worker or guaranteed offline navigation.
