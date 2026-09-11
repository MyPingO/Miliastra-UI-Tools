# GIL/GIA format and preservation notes

This documents the implemented schema, evidence, and limits. It is **not a claim
that every field of Miliastra's game format has been decoded**. The original
Conquest game, localization files, media, and extracted analysis samples are not
part of the site or its deployment.

## Evidence

- Local reference: `Conquest - 9.6.2026 V2.1.5 - Patches + Path Work.gil`.
- Size: 22,900,428 bytes. SHA-256:
  `9095716fd14f16623d36f7af2456eebd48607fe5238e225d9886e556490aa30d`.
- Envelope version 1; root game-version text is `7.0.0`.
- The level-name field differs from the filename. The editor displays the
  filename separately and preserves the embedded level name.
- [Public envelope research](https://github.com/script-1024/genshin-miliastra-file-format/blob/main/docs/en/Overview.md).
- [Public GIL section research](https://github.com/script-1024/genshin-miliastra-file-format/blob/main/docs/zh/%E5%86%85%E5%AE%B9%E8%B4%9F%E8%BD%BD/GIL.md).
- [Entity parsing implementation](https://github.com/marcos0318/auto-miliastra/blob/main/src/miliastra_agent/parsers/entities.py).
- [Official protobuf encoding](https://protobuf.dev/programming-guides/encoding/).
- The repository's existing editor-created GIA templates and compatibility
  modules provide additional evidence for UI rows and primitive list encoding.

Public names are used for corroborated sections. Unmapped sections are labeled
by number; a protobuf field can be parsed without knowing its semantic meaning.
In particular, field 37 is not assumed to be localization, compressed data, or
an archive merely because its payload is large.

## File envelope

All envelope words are unsigned 32-bit **big-endian** integers.

| Offset      | Meaning                    | Rule                                 |
| ----------- | -------------------------- | ------------------------------------ |
| 0           | File size excluding footer | Actual byte length minus 4           |
| 4           | Container version          | Reference: 1                         |
| 8           | Header magic               | `0x00000326`                         |
| 12          | File kind                  | 2 = GIL, 3 = GIA                     |
| 16          | Payload length             | Actual byte length minus 24          |
| 20          | Protobuf payload           | Exactly the declared number of bytes |
| End minus 4 | Footer magic               | `0x00000679`                         |

The reader rejects truncated and inconsistent envelopes, oversized fields,
invalid tags, varints above 64 bits, and unsupported wire types. Version 1 edits
are enabled; other container versions can be inspected and exported unchanged.
The input limit is 256 MiB. The site never writes to the user's original file.

## Protobuf representation

`tag = field_number * 8 + wire_type`. Supported wires are varint (0), fixed64
(1), length-delimited (2), and fixed32 (5). Fixed numeric values are little-endian.
Length-delimited fields can be text, nested messages, packed arrays, or opaque
bytes. Parsing a byte sequence as a message is **not proof that it is one**.

The field inspector offers an explicitly labeled UTF-8 interpretation and a
bounded message interpretation. It does not allow arbitrary field editing.
It expands at most 100 fields at a time and stops after 20 nested levels.

`game-wire.mjs` stores slices of the original buffer with offsets, original tag
bytes, field numbers, wire types, and occurrence numbers. A path consists of
`[fieldNumber, occurrence]` segments, using zero-based occurrences. Unknown
values are never converted to JSON and serialized back as part of a game export.

## Sections observed in Conquest

These lengths refer to section values, excluding their protobuf tag and length
prefix. The UI inventory shows the full serialized field size instead.

| Root field | Payload bytes | Interpretation / observed contents                          |
| ---------- | ------------: | ----------------------------------------------------------- |
| 2          |            52 | Level name                                                  |
| 3          |             0 | Export metadata, empty                                      |
| 4          |       141,447 | 93 prefab/template records, repeated field 1                |
| 5          |       523,575 | 360 scene entities, repeated field 1                        |
| 6          |        13,101 | Categories/configuration, 51 field-1 entries                |
| 7          |             0 | Terrain section, empty                                      |
| 8          |       119,750 | Component data, 99 field-1 entries; opaque                  |
| 9          |     1,836,114 | 2,709 UI records in field 502                               |
| 10         |     1,597,031 | Node graphs and related definitions; preserved              |
| 11         |       589,469 | Level settings; preserved                                   |
| 12         |           285 | Unmapped                                                    |
| 14         |            78 | Unmapped                                                    |
| 15         |        57,866 | Gameplay configuration; preserved                           |
| 16         |        39,648 | Animation/event data; preserved                             |
| 17         |             0 | Unmapped, empty                                             |
| 18         |           363 | Camera templates                                            |
| 19         |           166 | Unmapped                                                    |
| 20         |         9,525 | Unmapped                                                    |
| 21         |            33 | Unmapped                                                    |
| 22         |         1,401 | Feature flags                                               |
| 23         |            19 | Unmapped                                                    |
| 25         |       249,287 | Peripheral systems (achievements, scoring, etc.); preserved |
| 27         |     3,748,833 | 4,073 decoration field-1 records and 20,048 field-2 records |
| 29         |            55 | Editor information                                          |
| 30         |           164 | Unmapped                                                    |
| 31         |         6,113 | Unmapped                                                    |
| 32         |             0 | Unmapped, empty                                             |
| 33         |         2,095 | Unmapped                                                    |
| 35         |        34,961 | Unmapped                                                    |
| 36         |           416 | Localization-related section; preserved                     |
| 37         |     7,911,490 | Unmapped; preserved                                         |
| 38         |             0 | Unmapped, empty                                             |
| 40         |        varint | Unmapped                                                    |
| 41         |        varint | Unmapped                                                    |
| 43         |             5 | Game version string                                         |
| 44         |             0 | Unmapped, empty                                             |
| 45         |           324 | Unmapped                                                    |
| 46         |           110 | Unmapped                                                    |
| 48         |           223 | Unmapped                                                    |
| 49         |     6,016,253 | Unmapped; preserved                                         |

The object count (7,235) includes only the indexed record families above. The binary model also indexes 31 other message sections; these are preserved but not shown as editable objects. It
does not count field-27/2 entries as extra scene entities because their schema
is not established. It is not a count of every object-like record in the file.

## Scene entities and prefabs

Scene: `root.5.1[i]`. Prefab: `root.4.1[i]`.

| Meaning            | Scene record                                         | Prefab record    |
| ------------------ | ---------------------------------------------------- | ---------------- |
| ID                 | field 1, varint                                      | field 1, varint  |
| Template reference | field 2 message, ID at 1; field 8 fallback/reference | field 2, varint  |
| Properties         | repeated field 5                                     | repeated field 6 |
| Components         | repeated field 6                                     | repeated field 7 |
| Custom data blocks | repeated field 7                                     | repeated field 8 |

The name property has type field `1 = 1`, and a field-11 message containing the
name string at field 1. The custom-variable block also uses type `1 = 1`, with
variables in `11.1[i]`.

The public example `.proto` alone is insufficient: its GIL declarations omit
the outer section container and do not describe the prefab layout above. The
implementation follows the actual supplied bytes and corroborating parser.

### Variable definition

| Field | Meaning                         |
| ----- | ------------------------------- |
| 2     | Variable name, UTF-8            |
| 3     | Numeric type code               |
| 4     | Typed value wrapper             |
| 5     | Existing flag; preserved        |
| 6     | Type/schema metadata; preserved |

A typed value contains its type code at field 1, type/reference metadata at
field 2, and a type-specific message at `typeCode + 10`. Optional field 501 text
provides a member/variable name. Values and their schema metadata must agree.

### Implemented typed values

| Code | Type           | Value message                                 | Writable in full games                   |
| ---- | -------------- | --------------------------------------------- | ---------------------------------------- |
| 3    | Int32          | field 13; field 1 varint, absent = 0          | Yes                                      |
| 4    | Boolean        | field 14; field 1 varint, absent = false      | Yes                                      |
| 5    | Float32        | field 15; field 1 fixed32, absent = 0         | Yes                                      |
| 6    | String         | field 16; field 1 UTF-8, absent = empty       | Yes                                      |
| 8    | Int32 list     | field 18; repeated/packed field 1             | Yes                                      |
| 9    | Boolean list   | field 19; repeated/packed field 1             | Yes                                      |
| 10   | Float32 list   | field 20; repeated/packed field 1             | Yes                                      |
| 11   | String list    | field 21; repeated UTF-8 field 1              | Yes                                      |
| 25   | Structure      | field 35; typed members at repeated field 1   | Existing supported leaves                |
| 26   | Structure list | field 36; typed Structure wrappers at field 1 | Existing supported leaves                |
| 27   | Dictionary     | field 37; mirrored representations            | Existing values, when both mirrors match |

Signed Int32 values use two's-complement varints, not ZigZag. Negative output
uses sign-extended 64-bit varints. Inputs outside the Int32 range are rejected.
Float32 output rejects non-finite values and overflow. Numeric lists are
written in packed form; both packed and unpacked inputs are read. String lists
use repeated length-delimited strings, including empty strings.

Boolean/Float/String list writers are supported by the repository's existing
type encoding plus protobuf's packed conventions. The Conquest fixture has
populated Int32 lists and an empty String list; it does not contain controlled
populated examples for every enabled primitive-list writer. Synthetic tests
cover all four encodings. This distinction matters for compatibility claims.

Reference types (Entity, GUID, Configuration ID, Prefab ID), Faction, and
Vector3 are editable through their own codecs. Entity/GUID/Faction values use
unsigned decimal strings so they do not lose precision above JavaScript's safe
integer range. Configuration/Prefab references retain their nested field-1
message, existing reference-kind metadata, and field-2 ID. Vector3 retains its
nested field-1 vector message. Reference lists have dedicated encodings;
Vector3-list editing is not implemented in the binary model.

Structures retain configuration IDs and member order. The editor changes only
recognized leaf values. Structure-list row creation/deletion/reordering is not
implemented: rows contain additional per-instance references whose allocation
and lifetime rules have not been confirmed.

### Dictionary duplication is significant

Conquest dictionaries contain all of:

- repeated field 1: typed Structure entries, each holding key and value;
- repeated field 501: typed key mirrors;
- repeated field 502: typed value mirrors;
- fields 503/504: key/value type codes;
- optional field 505: value Structure configuration ID;
- entry-specific metadata and references.

Editing just one view could leave the file internally inconsistent. The v2
reader compares every key/value mirror against the corresponding two children
inside each serialized pair. Existing entry values are editable only when all
pairs match. Nested edits update both copies atomically and preserve entry IDs
and other metadata. Duplicate keys are rejected. Mismatched layouts remain
read-only. Binary dictionary row creation/removal is not implemented.

Variable JSON uses a separate schema-aware model and supports dictionary row
creation, reordering, removal, and nested values without inventing binary IDs.

## UI controls and List rows

GIL UI control records are at `root.9.502[i]`. Field 501 is the ID, field 504 is
the parent ID, and repeated field 505 stores properties. Child references and
control metadata are preserved. The property with type `502 = 15` stores its
name under `12.501`.

List configuration uses property type `502 = 47`. Its editable data path is:

```text
UI record
  505[property occurrence]
    502 = 47
    503 (property details)
      40 (list configuration)
        501[row occurrence]
          501 -> 501: row name
          502: Formal Variable pairs, plus other preserved fields
          505: one-based display order
          ... preserved item configuration
```

Formal pairs use `501` for the Formal Variable ID and `502` for its value
wrapper. The wrapper's type at 501 selects 11 (Integer), 12 (Float), 13 (String),
or 14 (Dynamic Text). These **UI type codes differ from object-variable types**.
The literal value is at field 501 of the typed message. Dynamic text adds one
more field-501 text wrapper. Unknown/nonliteral forms are preserved.

Nine UI List controls were found, including the primary/secondary/utility weapon
choices, tabs, invite-player list, and selected-modifier display. The workspace
uses stored Formal Variable IDs as labels; it does not invent names when a
control's definitions live on an ancestor page.

Row generation copies an existing row template. Names can use `{n}` sequences;
other fields remain copied. Ordering is normalized to 1..N, then serialized in
descending order as observed in the reference and existing GIA editor. At least
one row must remain. This does not create new control identities or synthesize
an independent visual layout.

## GIA support

The interface and component editing modules have been rebuilt. Three small
starting templates are derived from the original repository's generated blank
Single Choice, Tab, and Deck components. Their known UI IDs are remapped to
fresh temporary IDs when created. No legacy runtime/iframe is loaded.

Root fields 1 and 2 contain asset records. Asset fields 1 and 3 provide reference
metadata and a name. UI content is under `19.1`. **Scene content is `12.1` and
prefab content is `11.1`**, with custom data blocks at 7 and 8 respectively.
This distinction is confirmed by the supplied Explainer pair.

Structure GIA definitions are at `asset.22.1.1`: ID at 1, name at 501, repeated
member definitions at 3, member names at 501/5, type at 502, order at 503, and
typed default value at member field 3. The supplied Structure includes nested
Structure/Structure-list defaults, references, vectors, primitive lists, and a
Prefab-ID-to-Structure-list dictionary. The editor indexes primary and
referenced definitions separately and edits defaults while retaining schema
metadata. New binary definition/member creation is not implemented.

### Text bubbles

The before/after Explainer exports identify custom data component type 28,
message 39, repeated bubble records at 501. Each bubble has ID 501, attachment
point 503, font size 511, configuration name 601, and repeated text lines at 509. Literal line kind 18 stores text at `503.501`, duration at 504, and line ID
at 601. The empty new bubble has a distinct ID and appears before the existing
bubbles. The editor changes existing values, retaining bubble identities and
all other metadata. Creating/removing bubble records is not implemented.

### Supported properties only

The UI exposes named properties whose schema paths are supported by reference files.
The former raw field-path inspector has been removed. Other fields remain untouched;
no arbitrary wire-level controls are presented to users.

There is no automatic asset-to-game merge. Existing project-specific references
would require a validated remapping/dependency strategy. Use Miliastra's native
import workflow for generated GIA components.

## Edits, history, and export

`GameDocument` keeps immutable original record bytes and a map of edited record
buffers. History retains up to 100 changes, including atomic multi-record transactions for Formal Variable creation. Edits inside the same record
compose against its latest bytes. Multiple modified records in the same section
are combined before that section is written into the root.

- No changes: return a copy of the original complete file, including the exact
  original encoding and field order.
- Changes: splice modified record branches into the original sections, then
  rebuild only their enclosing lengths and the file envelope.
- Preserve unknown fields inside edited messages by retaining their raw bytes.
- Export a separate `- edited` file. Do not overwrite or upload the original.
- Undo/redo updates the record map; source files are never involved.

## Validation performed

`npm test` covers envelope rejection, integer precision, mixed packed encoding,
Unicode/multiline strings, limits, opaque fields, list generation/import,
multi-object edits, undo/redo, future-version rejection, UI row metadata, and
DOM interaction tests for the native interface. It also checks dictionary mirror updates, Formal Variable transactions, and JSON wrapper preservation.

Run the full reference regression with:

```sh
node scripts/check-reference.mjs "path/to/reference.gil"
```

On the supplied Conquest file it:

- indexed 93 prefabs, 360 scene entities, 2,709 UI controls, 4,073 decorations;
- read all 927 custom variables without indexing/decoding warnings;
- verified a byte-identical unedited round trip;
- edited and read back 1,690 supported values, including nested leaves;
- edited and duplicated rows in all nine recognized UI lists;
- exported and reopened 219 changed records in sections 4, 5, and 9;
- compared every reopened record to its intended output;
- verified every untouched root section remained byte-identical.

**Miliastra import/playtest validation has not been performed.** Parser and DOM
tests prove preservation and internal consistency of the implemented shapes,
not that every changed file passes the game's own semantic validation. Future
work should use controlled before/after game exports for reference types,
structure-row lifecycle, dictionary mirrors, asset merging, and unmapped sections.

## Additional v2 sample regression

`npm run test:samples -- "path/to/sample-folder"` reads the supplied files locally:

- `Test Structure.gia`: 60 asset records; 65 scalar/list/default edits, including
  nested dictionary values, exported and reopened.
- `Explainer.gia`: scene and prefab variables plus 10 existing text-line edits.
- `Explaine (Added a empty text bubble).gia`: scene and prefab variables plus
  11 text-line edits, including the newly added empty line.
- `Test Structure.json`: all seven root fields recognized; wrapper-preserving
  list edits, export and reopen, and exact unedited text preservation.

The samples are not committed or deployed. Their content is used only in local
checks. Browser checks exercise the native file chooser and editors. These
checks do not replace an in-game import/playtest.
