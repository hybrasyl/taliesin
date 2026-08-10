# WP6 — `ambient_sounds` pack kind

**Size: S.** **Not started.**

**Depends on:** nothing. Read `00-overview.md` first.

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

1. `src/renderer/src/packKinds/ambientSounds.ts` *(new)* — model on `soundEffects.ts` (flat numeric namespace). Emit `amb_{id:D4}.{ext}`, ids auto-assigned from 1.
2. `src/renderer/src/packKinds/index.ts` *(edit)* — register in `PACK_KINDS`.
3. `src/renderer/src/packKinds/types.ts` *(edit)* — add to the `ContentType` union **and** `ALL_CONTENT_TYPES`.
4. `src/main/schemas/pack.ts` *(edit)* — add to `contentTypeSchema` for main-process validation.

No edits to the editor/dialog/IPC layers are needed — the pack-kind system is data-driven.

Per-entry metadata goes through the existing `assetMetaFields()` → `reduceCoversFromMeta()` → `covers` pipeline. `itemIconsDye.ts` is the working precedent — the checkbox column and manifest folding come free through `PackEditor`.

## Non-goals (stop-lines)

- **No ambient interval scheduling.** Deferred in the pipeline doc; v1 is the loop flag. Recorded in `00a-backlog.md`.
- **No other new pack kinds.** `effects`, `projectiles`, `display_sprites`, `aisling_body`, `bundle`, `fonts`, `cutscenes` and `skeletal_animations` are scoped in the document repo with no Taliesin kind. They are candidates for the release after this one. Recorded in `00a-backlog.md`.

## Tests

Kind registration and `covers` folding, modelled on the `itemIconsDye` tests.

## Acceptance criteria

1. An `ambient_sounds` pack can be created, filled and compiled from the UI with no kind-specific editor code.
2. Its `covers` blob matches the shape above exactly.
3. Files are emitted as `amb_{id:D4}.{ext}` with ids auto-assigned from 1.
4. The manifest validates against `contentTypeSchema` in main.
5. All checks green.
