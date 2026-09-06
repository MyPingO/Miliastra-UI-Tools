# Miliastra UI Tools

Browser-based tools for editing and building supported Miliastra UI component `.gia` exports and variable `.json` exports.

The editor runs entirely in the browser. Files you open are processed locally and are not uploaded by the site.

## Live site

https://mypingo.github.io/Miliastra-UI-Tools/

## Supported UI component workflows

- **Single Choice** — edit/build choices, Formal Variables, values, sizing, and spacing.
- **Deck Selector** — edit/build deck rows, Known/Unknown Deck type, icons, titles, descriptions, tag colors, selector display settings, layout, timing controls, and ordering.
- **Tab** — edit/build tabs, Formal Variables, and visibility mappings.
- **Status Display Area** — edit/build Status Items, Formal Variables, values, and Monitor Entity Variable references.
- **Structure GIA** — edit/build verified Structure fields and list values.

Component-wide settings are separated from selected list/item data. Selecting a list item returns the inspector to its item-specific view, while global settings and global Formal Variable definitions remain under **Component Settings**.

### Deck Selector notes

Deck Selector supports **Known Deck** and **Unknown Deck** rows. Unknown Decks do not display their custom Deck Icon in the selector, but an icon ID can still remain serialized in the file. The site therefore disables the icon field for Unknown Deck rows while preserving any existing serialized value.

Tag colors use Miliastra-specific serialized values internally while the UI uses the editor-facing 1–6 numbering. The mapping confirmed from a six-row controlled export is:

- 1 White → internal 0
- 2 Green → internal 1
- 3 Blue → internal 2
- 4 Purple → internal 3
- 5 Orange → internal 4
- 6 Red → internal 9

Deck Title, Deck Description, and Tag Description remain normal Miliastra text fields, so variable-reference text such as `{1:lv.Example}` is preserved and editable.

Component Settings expose the identified controls for title display/text, List/Grid layout, selected/reset count display, remaining-time display, pre-end warning time, single-player pause behavior, collapse/cancel behavior, and Known Deck icon/title/description visibility.

### Status Display Area note

Miliastra does not restore **Unit Status** links when a Status Display Area `.gia` is imported, including files originally exported by Miliastra. These links must be configured manually in Miliastra after import, so the site does not expose a Unit Status link editor.

Monitor Entity Variable references are supported and survive import in the tested cases.

## Supported variable JSON workflows

- Dictionary
- Structure
- Nested Dictionary / Structure values
- StructList
- Supported scalar and list variable types

User-facing type names are normalized for readability while the original Miliastra serialization identifiers are preserved internally. Examples:

- `Army` → **Faction**
- `ConfigReference` → **Configuration ID**
- `EntityReference` → **Prefab ID**
- `Dict` → **Dictionary**

## Editing features

- Open, edit, and export supported `.gia` and `.json` files
- Build new supported files from validated templates/defaults
- Undo / redo
- Filtering and search
- Copy / paste
- Duplicate, reorder, and delete
- CSV import where supported
- Keyboard shortcuts
- Separate selected-item and component-settings views for supported UI components

## Compatibility and serialization

The production shell loads a pinned editor baseline stored directly in this repository and layers validated compatibility fixes and component modules on top of it. No external runtime copy of the editor is required.

Important compatibility rules:

- Untouched binary branches are preserved byte-for-byte where possible.
- GIA headers and payload lengths are validated on export.
- Existing unknown fields are preserved instead of being discarded.
- Formal Variable names use the confirmed **30-character** limit.
- Build New templates are based on editor-created defaults rather than populated examples wherever validated empty templates are available.
- User-facing renamed variable types do not change Miliastra's underlying serialized type identifiers.

## Repository layout

```text
index.html
assets/
  editor-core.html
  core-patches.js
  icon.svg
  site.css
  site.js
  component-tabs.js
  deck-selector.js
  status-display.js
  status-v2.part1.txt … status-v2.part6.txt
  type-labels.js
```

The production site is self-contained in this repository. `editor-core.html` is the pinned editor baseline and `core-patches.js` applies validated compatibility fixes before startup. `status-display.js` loads the Status Display implementation chunks and the Deck Selector/type-label enhancements from local repository assets.

## Development policy

Changes to GIA parsing or serialization should be based on controlled exports from Miliastra and validated by importing generated files back into the editor. Browser parsing alone is not considered proof of Miliastra compatibility.
