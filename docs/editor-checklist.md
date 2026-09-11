# Editor usability checklist

Use this checklist for each release. Expectations are written from the user's perspective.
The September 2026 polish pass covers the editor experience; Miliastra import compatibility
will be checked separately with the next supplied files.

## Find my work

- [x] I can open a file or create a supported component immediately, without a demo.
- [x] I see readable names and supported settings, never numbered binary field paths.
- [x] Search and filters help me find objects; empty results offer a clear way back.
- [x] Switching files remembers my object, tab, search, and expanded data.
- [x] Renaming something updates its displayed name without interrupting typing.

## Edit a list

- [x] Add row creates a new value; Duplicate copies the row I chose.
- [x] Move up/down changes the intended row and stops at the list boundaries.
- [x] Remove can be undone, and a required final row cannot be removed.
- [x] Generate explains which column changes and whether it appends or replaces rows.
- [x] Bulk editing explains replacement, supports cancellation, and rejects malformed data without changing the list.
- [x] Changing bulk formats does not silently erase my draft.
- [x] JSON/CSV download includes the last value I typed and does not mark the whole file exported.
- [x] Large lists remain navigable; row actions stay reachable while scrolling.

## Recover from mistakes

- [x] Invalid values show a readable error beside the value and cannot be exported.
- [x] Escape restores an unfinished or invalid value; Enter commits a single-line value.
- [x] Undo/redo affects only the current file and explains the change being undone.
- [x] Dialogs have clear names, keyboard focus, Cancel/Close, and do not leak shortcuts to the editor.
- [x] Unsupported settings explain their status and remain preserved on export.

## Open, export, and leave

- [x] A broken or unsupported file leaves my existing work intact.
- [x] Repeated creation clicks do not create duplicate documents while loading.
- [x] Export downloads the active file; it never overwrites the original automatically.
- [x] File status distinguishes unchanged, unexported, and exported work.
- [x] Closing a new or modified file offers export, keep editing, or discard.
- [x] Refreshing or leaving with unexported work triggers the browser's warning.

## Read and navigate comfortably

- [x] Regular labels and values are readable; long names and errors wrap.
- [x] Every icon button has an accessible name and a visible focus indicator.
- [x] The editor works at desktop and narrow widths without page-level horizontal overflow.
- [x] Help remains reachable at narrow widths and explains supported workflows plainly.

## Foundation for future format work

- [x] Shared controls handle commits, validation, downloads, and dialogs consistently.
- [x] List behavior is shared across components, variables, and JSON.
- [x] UI code does not expose raw binary editing; the preservation engine stays separate.
- [x] Regression tests cover data-loss risks and user-visible workflows.
- [x] Formatting, tests, and the static build pass.
- [x] Known format limits remain documented without claiming in-game validation.

## September 11, 2026 verification

Checked items were reviewed through automated tests, direct browser interaction, or source review.

- 23 tests passed, covering typed value validation, draft commits, list downloads, row operations,
  generation and paging, bulk replacement and cancellation, independent history, file switching,
  expanded-state restoration, close prompts, shortcut isolation, and binary preservation.
- Browser checks covered deck editing, property-tab changes during an edit, invalid-value recovery,
  choice-list Formal Variables, new Structure fields, remembered file selection/search, and close dialogs.
- Desktop (1280 × 800) and narrow (390 × 844) layouts were inspected. The narrow layout had no
  document-level horizontal overflow; Help and list controls remained available.
- The legacy raw-field UI, recursive field scanner, styles, and links were removed. Unsupported
  binary sections remain in the preservation model and are excluded from the object picker.
- Shared input commits, inline validation, dialog focus, list actions, and view state are implemented
  in the existing UI modules, with no new runtime dependencies.

Deployment is verified separately after merging to GitHub Pages. In-game import/export compatibility,
new binary schemas, and game-side behavior are reserved for the next reference-file testing phase.
