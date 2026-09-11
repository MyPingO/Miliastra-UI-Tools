# Miliastra UI Tools

[Open the editor](https://mypingo.github.io/Miliastra-UI-Tools/)

A local browser editor for Miliastra UI lists, object data, and Structures.
Open multiple **GIA**, **GIL**, and **JSON** files in one interface. Files are
processed on your device and are never uploaded by the editor.

## Editing

- Create deck selectors, single choice windows, tabs, Structure JSON, and dictionary variable JSON.
- Edit UI list rows and Formal Variable values. Add Formal Variables when their owning page can be identified unambiguously.
- Edit deck titles, descriptions, tags, icon IDs, and deck settings.
- Add, duplicate, move, remove, generate, and bulk import/export list rows as JSON or CSV.
- Open full GIL games and GIA exports, including scene objects and referenced prefabs.
- Edit supported variables and Structure defaults: primitive scalars and lists, IDs, vectors, nested Structures, and existing dictionary entries with matching binary mirrors.
- Edit object names/transforms, mapped UI properties, and existing text-bubble text, duration, attachment point, and font size.
- Edit JSON Structure fields, nested lists, and typed dictionary entries.
- Undo/redo changes independently per file. Export a separate file when ready.

The full game schema is not completely mapped. The interface shows supported,
named settings only. Unknown bytes remain unchanged.
Unedited binary and JSON exports preserve the original bytes/text.

New binary Structure definitions, new nested binary Structure rows, dictionary
row creation in binary files, and automatic repair of linked game references
are not implemented. Tab visibility mappings and nameplate-specific settings
are not available in the interface yet. Generated
and edited files still need an import/playtest check in Miliastra.

## Editor behavior

- File switching remembers selection, search, expanded data, and list pages for this browser session.
- Add row starts new values; Duplicate copies a selected row. Component settings are retained.
- Edits are applied before commands. Errors appear beside invalid inputs; Escape restores the previous value.
- List downloads export list data only. Export file downloads the complete active file.
- New or changed files prompt before closing and offer export, discard, or keep editing.
- No changes are stored across page reloads. Export your files before leaving.

The [user-experience checklist](docs/editor-checklist.md) records release expectations and verification.

## Development

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
```

The dev server runs at `http://127.0.0.1:4173/`. GitHub Pages serves the checked-in
static files from `main`; `dist/` is an optional clean static build. There are no
runtime packages or CDN dependencies. jsdom is used only for tests.

Optional local reference checks (private files are not included):

```sh
npm run test:reference -- "path/to/game.gil"
npm run test:samples -- "path/to/sample-folder"
```

## Foundation

- `src/app.mjs`: file sessions, selection, undo/redo, import and export orchestration.
- `src/models/`: binary/JSON sessions and component list schemas.
- `src/ui/`: shared controls, list tables, nested value editors, and inspector.
- `src/core/`: CSV and component-template creation.
- `assets/game-*.mjs`: lossless binary envelope/wire editing and verified schema paths.
- `assets/templates/`: three small templates derived from the original repository.
- `tests/`: model, preservation, and DOM workflow tests.

The v2 interface is rebuilt without the old nested iframes, HTML injection,
global editor state, or runtime patch stack. The verified wire-preservation
engine is retained. The old UI remains recoverable in Git history.

See [format notes](docs/gil-format.md) for evidence and precise limits.
