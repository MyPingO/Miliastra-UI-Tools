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
- **Structure GIA** — read Structure definitions and build the field types whose complete editable default serialization is confirmed. Imported Struct, StructList, and Dictionary fields expose identified reference/type metadata without inventing project-specific Structure definitions.

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

### Structure reference and Build New rules

Struct and StructList fields can reference user-created Structures by **Structure Configuration ID**. Those referenced Structures are project-specific and are not treated as universal schemas or Build New defaults.

When reading a Structure GIA, the editor exposes the referenced Structure Configuration ID where it can be identified. Dictionary fields also expose identified key/value type metadata, their Dictionary type ID, and a referenced Structure Configuration ID when the value is Struct or StructList.

A Structure Configuration ID by itself is not enough to construct a nested Structure value. Existing Struct/StructList values contain the ordered value shape of the referenced custom Structure, and GIA defaults can embed the referenced Structure shape as well. Build New therefore does **not** fabricate Struct or StructList fields from only an ID.

For Structure GIA Build New, only fully configurable field types are shown. Current editable scalar defaults are:

- String
- Integer / Int32
- Float
- Bool
- Vector3
- Configuration ID
- Prefab ID

Current editable populated list defaults are:

- StringList
- Int32List
- BoolList
- Vector3List

`Int32List` and `BoolList` use Miliastra's confirmed packed repeated encoding. The scalar default encodings for String, Int32, Float, Bool, Vector3, Configuration ID, and Prefab ID are taken from the supplied populated Structure reference.

Field types whose complete editable default shape is not yet confirmed are still readable when opening an existing GIA, but are not offered in Build New. This currently includes Struct, StructList, Dictionary, Entity, GUID, Faction, and their unconfirmed list forms. In particular, the empty String → String Dictionary template is no longer exposed as a Build New option until populated Dictionary entry serialization is confirmed, because offering an uneditable empty Dictionary was misleading.

## Supported variable JSON workflows

- Dictionary
- Basic Structure
- Nested Dictionary values
- Existing Struct / StructList values when their complete custom Structure shape is present in the opened data
- Supported scalar and list variable types

JSON primitive/list values are self-contained. List values now have direct item controls for adding, editing, duplicating, reordering, and deleting entries rather than requiring raw JSON-array editing.

For JSON Build New, all self-contained scalar/list types and nested Dictionaries are configurable. Blank Struct/StructList creation is intentionally not offered because an external Structure Configuration ID does not define the required field shape.

When an opened JSON already contains a Struct or StructList, its existing field values remain editable because the complete ordered value shape is known from the file. Its Structure Configuration ID, field count/order, and field types are treated as part of the referenced external schema and are not freely rewritten. Existing complete Structure values can still be duplicated or copied/pasted where the target expects the same Structure Configuration ID and shape.

For a Dictionary whose value type is Struct or StructList, existing entries remain editable and duplicable. Blank **Add Entry** is disabled because it would require fabricating an unknown Structure shape; a complete compatible entry can be pasted instead.

User-facing type names are normalized for readability while the original Miliastra serialization identifiers are preserved internally. Examples:

- `Army` → **Faction**
- `ConfigReference` → **Configuration ID**
- `EntityReference` → **Prefab ID**
- `Dict` → **Dictionary**

Dictionary key types exposed by the JSON editor are String, Integer, GUID, Configuration ID, Prefab ID, Faction, and Entity, using their canonical serialized identifiers internally.

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

The production shell loads a pinned editor baseline stored directly in this repository and layers validated compatibility/component modules on top of it. No external runtime copy of the editor is required.

Important compatibility rules:

- Untouched binary branches are preserved byte-for-byte where possible.
- GIA headers and payload lengths are validated on export.
- Existing unknown fields are preserved instead of being discarded.
- Formal Variable names use the confirmed **30-character** limit.
- Build New templates are based on editor-created defaults rather than populated examples wherever validated empty templates are available.
- Project-specific Structure Configuration IDs and nested Structure layouts are not reused as generic defaults.
- Build New hides shapes whose complete editable serialization cannot be determined from the available controlled data.
- User-facing renamed variable types do not change Miliastra's underlying serialized type identifiers.

## Repository layout

```text
index.html
assets/
  editor-core.html
  icon.svg
  site.css
  site.js
  component-tabs.js
  deck-selector.js
  dictionary-key-types.js
  dictionary-structure-config.js
  structure-gia-references.js
  data-shape-safety.js
  value-editors.js
  status-display.js
  status-v2.part1.txt … status-v2.part6.txt
  type-labels.js
```

The production site is self-contained in this repository. `editor-core.html` is the pinned editor baseline; the remaining local scripts layer the validated component, compatibility, reference-reading, shape-safety, and value-editor behavior used by the site.

## Development policy

Changes to GIA parsing or serialization should be based on controlled exports from Miliastra and validated by importing generated files back into the editor. Browser parsing alone is not considered proof of Miliastra compatibility.
