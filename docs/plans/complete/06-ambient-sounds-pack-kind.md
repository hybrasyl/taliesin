# WP6 — `ambient_sounds` pack kind

**Size: S. ✅ Shipped 2026-08-10** (`ace1cab`, then `e578bcc` for the loop default).

**Depends on:** nothing. Read `../00-overview.md` first.

## What shipped, against this plan

The four-step recipe and nothing else — no editor, dialog or IPC change, as predicted. One thing the
plan could not have settled in advance, and it changed the `covers` shape after the first merge.

**BRIG-16 never said what the client does when `covers.ambient_sounds` has no entry for an id.**
`ace1cab` deliberately did not improvise it and wrote `{ "loop": true }` for flagged assets. That
left the default undecided, and the wrong default is not a cosmetic error: the client already starts
a bed with `Mix_PlayChannel(…, -1)`, so a default of "do not loop" would silence every pack that
carries no metadata. Decided 2026-08-10 — **a missing entry means loop** — and `e578bcc` inverted
the flag to match. It is now the negative `no_loop`, labelled "One-shot", which is the `no_dye` shape
`item_icons` already uses, and only one-shots are written down.

The negative flag also keeps `PackEditor` untouched, which is not incidental. It draws a boolean as
`checked={assetMeta[key] === true}`, so unchecked-by-default is the only state it can render without
adding a default to `AssetMetaField`.

`entrySchema` did not change — `loop` was already optional. So `{ "loop": true }` still reads from a
hand-edited pack, packs written by the first merge open and play identically, and no migration is
needed. Decision 3 in this document was added at that point and records the same thing.

Ids are 1-based because `Map/@AmbientSound` is an `unsignedByte` where 0 means "no ambient", so there
is no id 0 to author.

## Goal

Add the `ambient_sounds` `.datf` content type so ambient audio can be authored in Taliesin and read by the Brigid client. The only pack-kind work in this milestone; everything else is legacy-format decode.

## Decisions (Sabrael, 2026-07-28)

1. **`ambient_sounds` is in scope for this milestone,** although it is a pack kind rather than a legacy-format feature. It has an assigned phase and a gate in the document repo's `docs/plans/hybrasyl.client/ambient-audio-pipeline.md` §4.
2. **v1 carries one field, `Loop`.** Interval scheduling is deferred — see `00a-backlog.md`.
3. **Looping is the default (Sabrael, 2026-08-10).** A missing `covers` entry means the client loops
   the bed. So the flag is written only for one-shots, as `loop: false`, and the UI field is the
   negative `no_loop` ("One-shot") — the shape `item_icons` already uses for `no_dye`. Recorded as
   the contract on the document repo's BRIG-16.

## Contract

The contract is the document repo's `docs/plans/hybrasyl.client/ambient-audio-pipeline.md` §4. Shape the `covers` blob so the deferred interval fields need no schema bump:

```json
{ "1": { "loop": false } }
{ "1": { "mode": "interval", "play": 180, "silence": 120 } }
```

`{ "loop": true }` is legal to read and states the default. Nothing writes it.

Manifest stays `schema_version: 1`. This `covers.ambient_sounds` shape **is** the contract the client's `AmbientPack` reads — do not improvise it.

## File map

Follow the four-step recipe in `packKinds/index.ts` (also in `CLAUDE.md`):

1. `src/renderer/src/packKinds/ambientSounds.ts` _(new)_ — model on `soundEffects.ts` (flat numeric namespace). Emit `amb_{id:D4}.{ext}`, ids auto-assigned from 1.
2. `src/renderer/src/packKinds/index.ts` _(edit)_ — register in `PACK_KINDS`.
3. `src/renderer/src/packKinds/types.ts` _(edit)_ — add to the `ContentType` union **and** `ALL_CONTENT_TYPES`.
4. `src/main/schemas/pack.ts` _(edit)_ — add to `contentTypeSchema` for main-process validation.

No edits to the editor/dialog/IPC layers are needed — the pack-kind system is data-driven.

Per-entry metadata goes through the existing `assetMetaFields()` → `reduceCoversFromMeta()` → `covers` pipeline. `itemIconsDye.ts` is the working precedent — the checkbox column and manifest folding come free through `PackEditor`.

## Non-goals (stop-lines)

- **No ambient interval scheduling.** Deferred in the pipeline doc; v1 is the loop flag. Recorded in `00a-backlog.md`.
- **No other new pack kinds.** `effects`, `projectiles`, `display_sprites`, `aisling_body`, `bundle`, `fonts`, `cutscenes` and `skeletal_animations` are scoped in the document repo with no Taliesin kind. They are candidates for the release after this one. Recorded in `00a-backlog.md`.

## Tests

Kind registration and `covers` folding, modelled on the `itemIconsDye` tests.

## Acceptance criteria

1. ✅ An `ambient_sounds` pack can be created, filled and compiled from the UI with no kind-specific editor code. **The on-screen pass is HTOO-152's `needs-testing` state.**
2. ✅ Its `covers` blob matches the shape above exactly — one-shots only, keyed by numeric id.
3. ✅ Files are emitted as `amb_{id:D4}.{ext}` with ids auto-assigned from 1.
4. ✅ The manifest validates against `contentTypeSchema` in main.
5. ✅ All checks green.
