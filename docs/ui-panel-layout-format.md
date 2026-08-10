# UI Panel Layout Format (`ui_panels`, schema_version 2)

Authoritative contract for UI panel layout asset packs. Taliesin (authoring, the
UI Layout Forge) and Brigid (consumption) both implement against this document.

Ancestry: the Tier 3 design in Comhaigne's
`docs/plans/hybrasyl.client/ui-asset-pack-scoping.md`. This document supersedes
it in two ways: variable **bindings ship inside the layout XML** (the original
"no binding expressions" non-goal is superseded — Brigid is co-developed to
ingest them), and the informational `variables_used` covers field is added.
Everything else (pack structure, naming, resolution rules) is carried forward
unchanged.

## Pack structure

A `ui_panels` pack is a standard `.datf` (ZIP) archive:

```text
hybui-extstats.datf
├── _manifest.json                   # pack header (JSON, schema_version 2)
├── extstats.xml                     # one layout XML per panel
├── extstats_bg.png                  # default/first-variant background
├── extstats_expanded_bg.png         # per-variant background
├── extstats_expand_btn_normal.png   # per-control state art
└── extstats_expand_btn_pressed.png
```

Naming conventions (all flat at the archive root):

| File        | Convention                                                                       |
| ----------- | -------------------------------------------------------------------------------- |
| Layout      | `{panel_id}.xml`                                                                 |
| Background  | `{panel_id}_bg.png` or `{panel_id}_{variant}_bg.png`                             |
| Control art | `{panel_id}_{control_name}_{state}.png`, state ∈ `normal`, `pressed`, `disabled` |

Control art coverage is emergent from shipped PNGs — the XML does not enumerate
states. A control with no art renders as chrome-only (label text, primitive
button, etc.) exactly as legacy panels do.

Design-spec markdown (`specs/*.md`, see below) lives in the authoring project
directory only and is **never** compiled into the `.datf`.

## Manifest

```json
{
  "schema_version": 2,
  "pack_id": "hybui-extstats",
  "pack_version": "0.1.0",
  "content_type": "ui_panels",
  "priority": 100,
  "covers": {
    "ui_panels": {
      "panel_ids": ["extstats"],
      "variables_used": ["player.hp", "player.maxhp", "player.ext.crit"]
    }
  }
}
```

- `schema_version` is `2` for `ui_panels` packs (XML layout files are a new
  capability; v1-only clients skip the pack via the existing reject path).
  All other content types remain `schema_version: 1`.
- `covers.ui_panels.panel_ids` — informational; actual coverage emerges from
  which `{panel_id}.xml` files ship.
- `covers.ui_panels.variables_used` — informational; derived at compile time
  from every `bind*` attribute across all layouts in the pack (sorted, deduped,
  indexed paths normalized to template form, e.g. `inventory.slot[n].name`).
  Lets a consumer warn about a pack that binds variables it doesn't know
  without parsing every XML. The real bindings live in the XML.

## Layout XML

```xml
<?xml version="1.0" encoding="utf-8"?>
<panel id="extstats" layout-version="1">
  <anchor rect="0,0,160,100"/>

  <variant name="compact" background="extstats_bg.png">
    <label name="hp_text" rect="10,10,60,14" align="right"
           bind="player.hp" bind-max="player.maxhp" format="{value}/{max}"/>
    <progressbar name="hp_bar" rect="10,26,120,8" frames="12"
                 bind="player.hp" bind-max="player.maxhp"/>
    <label name="crit" rect="80,10,60,14" align="right"
           bind="player.ext.crit" format="{value:0.0}%"/>
    <image name="mail_icon" rect="140,4,16,16" bind-visible="player.mailstatus"/>
    <button name="expand_btn" rect="4,80,24,16"/>
    <textbox name="chat_input" rect="10,84,100,14" max-length="80"/>
  </variant>

  <variant name="expanded" background="extstats_expanded_bg.png">
    <!-- ... -->
  </variant>
</panel>
```

### Elements

- `<panel id="..." layout-version="1">` — root. `id` must match the filename
  stem and `[a-z0-9_]+`. `layout-version` is the format evolution lever;
  this document describes version `1`.
- `<anchor rect="x,y,w,h"/>` — required, exactly one. The panel's logical
  bounds. `x,y` are the panel's default on-screen offset; `w,h` define the
  panel's own coordinate space that every control rect lives in.
- `<variant name="..." background="...">` — one or more. `name` matches
  `[a-z0-9_]+` and is unique within the panel. `background` is optional and
  references a PNG in the same pack by filename. Variants are alternate
  presentations of one panel (e.g. `compact` / `expanded`); the consumer
  chooses which variant to show.
- Controls — zero or more per variant, element name is the control kind:
  `<label>`, `<button>`, `<image>`, `<textbox>`, `<progressbar>`.

### Control attributes

| Attribute      | Applies to                         | Required | Meaning                                                                                                                                                                                      |
| -------------- | ---------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`         | all                                | yes      | `[a-z0-9_]+`, unique within its variant. Feeds the art filename convention and is the C#-side lookup key.                                                                                    |
| `rect`         | all                                | yes      | `x,y,w,h` in logical pixels, relative to the anchor's coordinate space.                                                                                                                      |
| `align`        | label                              | no       | `left` \| `center` \| `right` (default `left`).                                                                                                                                              |
| `max-length`   | textbox                            | no       | Maximum input length.                                                                                                                                                                        |
| `frames`       | progressbar                        | no       | Frame count of the bar's fill art (default 1 = continuous fill).                                                                                                                             |
| `bind`         | label, textbox, progressbar, image | no       | Primary value path (see Variable namespace). Label/textbox: text source. Progressbar: current value. Image: numeric frame selector.                                                          |
| `bind-max`     | progressbar, label                 | no       | Max-value path. Progressbar denominator; enables `{max}` in label formats.                                                                                                                   |
| `bind-visible` | all                                | no       | Boolean path; the control is hidden while the value is false.                                                                                                                                |
| `format`       | label, textbox                     | no       | Template with `{value}` / `{max}` placeholders. Optional .NET-style numeric spec after a colon (`{value:0.0}`); Brigid renders via `string.Format`-compatible semantics. Absent → raw value. |

Buttons take no `bind` — actions and events remain C#-owned (the `PrefabPanel`
subclass wires behavior by control name). Controls without any `bind*`
attribute are static.

### Resolution rules

- Rects are logical pixels in the panel's own coordinate space (640×480
  virtual resolution world).
- Background/art PNGs may be authored at 1×, 2×, or 4× the logical size. The
  renderer point-filter (nearest-neighbor) scales to the XML's logical rect —
  the image's pixel dimensions never override the rect.

## Variable namespace

Canonical dotted paths, lowercase. The machine-readable registry is
`src/renderer/src/uiforge/variableCatalog.ts` (single source of truth; this
section is the human summary). Types: `string`, `int`, `float`, `bool`,
`sprite`.

| Namespace                              | Source packet        | Paths                                                                                                                                                                                                                                                  |
| -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `player.*`                             | 0x08 Attributes      | `name`, `level`, `ability`, `hp`, `maxhp`, `mp`, `maxmp`, `stats.str/int/wis/con/dex`, `levelpoints`, `weight`, `maxweight`, `experience`, `abilityexp`, `gold`, `blinded`, `mailstatus`, `element.offense`, `element.defense`, `combat.mr/ac/dmg/hit` |
| `player.ext.*`                         | 0xFF ExtendedStats   | `mr`, `hit`, `dmg`, `crit`, `magiccrit`, `dodge`, `magicdodge` (all float)                                                                                                                                                                             |
| `player.profile.*`                     | 0x39 SelfProfile     | `guild`, `class`, `nation`, `grouptext`                                                                                                                                                                                                                |
| `inventory.slot[n].*`                  | 0x0F/0x10            | `name`, `count`, `durability`, `sprite`, `color` — n: 1–59                                                                                                                                                                                             |
| `equipment.<slot>.*`                   | 0x37/0x38            | `name`, `sprite`, `durability` — 18 slot names per Brigid's equipment enum (e.g. `equipment.weapon.name`)                                                                                                                                              |
| `skills.slot[n].*`, `spells.slot[n].*` | 0x2C/0x2D, 0x17/0x18 | `name`, `sprite` — n: 1–90, holes at 35/71/89                                                                                                                                                                                                          |
| `group.*`                              | 0x63                 | `size` (int), `ingroup` (bool)                                                                                                                                                                                                                         |

Indexed templates use a literal 1-based index in the XML
(`bind="inventory.slot[3].count"`).

**Reserved (deferred) namespaces** — do not invent paths here: indexed group
members (`group.member[n].*`), status-bar effect icons (0x3A, `status.*`),
button actions/events (`action.*`), exchange/board/chat state (`ui.*` beyond
what a future revision defines).

Type-compatibility rules enforced by the Forge (and recommended for Brigid's
loader): `progressbar` `bind`/`bind-max` must resolve to numeric types;
`bind-visible` must resolve to `bool`; `image` `bind` must resolve to `int` or
`sprite`.

Binding a path that is not in the catalog is a warning, not an error — a pack
may intentionally bind a variable that is spec'd but not yet implemented
server-side (see Design specs). Consumers must treat unknown paths as unbound
(control renders static) rather than failing the pack.

## Design specs (authoring-side only)

When a layout needs a variable the server doesn't expose, the Forge writes a
Markdown design spec to `specs/<slug>.md` inside the pack project directory
(status: proposed). The spec names the variable, type, update frequency, and
the concrete hybrasyl implementation options (new `StatUpdateFlags` bit on
0x08 / f32 appended to 0xFF ExtendedStats / new opcode + ServerPacket class)
with exact file references. Specs are working documents handed to the server
team; they are not pack content and are excluded from compilation.

## Legacy prefab import mapping

The Forge can draft a layout from a legacy control `.txt` prefab
(setoa.dat/cious.dat). Brigid-side expectations for imported panels:

- The first `Anchor` control becomes `<anchor>`; all other control rects are
  re-based to the anchor's origin.
- Kind heuristics: `EditableText` → `textbox`; `ReadonlyText` → `label`;
  images + a return value → `button`; images only → `image`; anything else →
  `label` (flagged in the import review).
- Legacy control names are sanitized to `[a-z0-9_]` and de-duplicated.
- Legacy image frame 0 → `_normal.png`, frame 1 (when present) → `_pressed.png`.
