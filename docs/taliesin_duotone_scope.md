# Taliesin: Palette & Duotone System — Scope Document

## 1. Summary

Add palette-based asset transformation capabilities to Taliesin, primarily for generating element-colored variants of ability icons. Provides a palette management UI, a duotone processing pipeline with variant selection, batch processing against asset folders, and calibration persistence so configuration survives across sessions.

The initial motivating use case is generating element-colored variants of ~20-30 form-swap ability icons across 17 elements (~340-510 total outputs). The system is designed to generalize to any future palette-based asset transformation: status effect tinting, faction theming, damage type indicators, etc.

## 2. Goals

- Eliminate manual per-icon duotone work in external tools (GIMP, Photoshop) for palette-based icon variants
- Establish a canonical palette definition that both Taliesin and the MonoGame client read from
- Provide interactive calibration with visual preview, not just algorithmic processing
- Support batch operations for production runs across entire asset folders
- Persist calibration decisions so re-runs produce consistent results
- Integrate cleanly with Taliesin's existing asset pack management

## 3. Non-Goals

- Full-color-to-duotone conversion of icons with internal color relationships (those remain hand-painted)
- Photoshop-style general-purpose image editing (Taliesin is not replacing image editors)
- Real-time runtime tinting in the game client (separate concern; this is the baked-file pipeline)
- Contributor-accessible palette editing (initial scope is single-developer/team tool)
- Animation, keyframing, or time-varying duotones

## 4. Architecture

### 4.1 Component Overview

The system consists of four concerns that should be separated in the implementation:

**Palette definitions** — structured data defining named color palettes and their member entries. Source of truth for both Taliesin and the game client.

**Transformation processor** — the duotone algorithm itself, taking a source image and palette entry and producing a colored output. Called by Taliesin's UI layer and potentially by batch/CLI invocations.

**Calibration storage** — per-(asset, palette-entry) configuration persisting which variant was selected. Separate from palette and asset data.

**UI layer** — React components exposing palette editing, icon processing, variant selection, and batch operations.

### 4.2 Data Model

#### Palette

```typescript
interface Palette {
  id: string // e.g. "elements"
  name: string // e.g. "Elements"
  description?: string
  entries: PaletteEntry[]
  version: number // for schema evolution
  lastModified: string // ISO timestamp
}

interface PaletteEntry {
  id: string // e.g. "fire"
  name: string // e.g. "Fire"
  shadowColor: string // hex "#FF4D2D"
  highlightColor: string // hex "#FF8A3D"
  defaultDarkFactor?: number // 0.0-1.0, default 0.3
  defaultLightFactor?: number // 0.0-1.0, default 0.3
  category?: string // optional grouping
  notes?: string
}
```

#### Calibration

```typescript
interface AssetCalibration {
  assetId: string // icon identifier
  paletteId: string // which palette
  entryCalibrations: {
    [entryId: string]: {
      darkFactor: number
      lightFactor: number
      midpointLow: number // default 0.25
      midpointHigh: number // default 0.75
      selectedVariantId?: string // which variant was chosen
      autoDetected?: boolean
      lastCalibrated: string
    }
  }
}
```

#### Asset Metadata

```typescript
interface IconAsset {
  id: string
  filename: string
  path: string
  processingMode: 'static' | 'palette' // palette or hand-painted
  paletteId?: string // if palette mode, which one
  grayscaleMasterPath?: string // derived grayscale file
  outputPaths?: {
    // per-entry output files
    [entryId: string]: string
  }
}
```

### 4.3 Storage

- Palettes stored as JSON files in `{project}/palettes/{palette_id}.json`
- Calibrations stored as JSON files in `{project}/calibrations/{palette_id}.json`
- Asset metadata stored in existing Taliesin asset pack format (extend as needed)
- All files should be version-controllable (stable key ordering, formatted output)

### 4.4 Shared Palette Source of Truth

The palette JSON format must be readable by both Taliesin and the MonoGame client. Options in order of preference:

1. **Shared schema, independent parsers.** Both tools define their own parsing code against a documented JSON schema. Simpler, no build-time dependencies between tools.
2. **Shared C# library that Taliesin shells out to.** More complex but ensures absolute consistency.
3. **Build step that generates client-ready palette files from Taliesin's working format.** Useful if Taliesin's format is more complex than what the client needs.

Recommendation: option 1 for v1. The JSON schema is simple enough that parsing divergence is unlikely to cause issues.

## 5. Duotone Algorithm

### 5.1 Core Operation

Four-stop gradient mapping from image luminance to color:

```
luminance 0.0              -> darker_shadow    (shadow × (1 - darkFactor))
luminance midpointLow      -> shadow            (palette shadow color)
luminance midpointHigh     -> highlight         (palette highlight color)
luminance 1.0              -> lighter_highlight (highlight + (255 - highlight) × lightFactor)
```

Linear interpolation within each segment. Alpha channel preserved unchanged.

Luminance computed using ITU-R BT.601 weights:

```
lum = (0.299 × R + 0.587 × G + 0.114 × B) / 255
```

### 5.2 Parameters

- **darkFactor** (0.0-1.0): how much to darken the extended shadow. 0.0 = pure palette shadow for darkest pixels. 0.5 = shadow darkened by 50% for darkest pixels.
- **lightFactor** (0.0-1.0): how much to lighten the extended highlight. 0.0 = pure palette highlight for brightest pixels. 0.5 = highlight moved 50% toward white for brightest pixels.
- **midpointLow** (0.0-0.5): luminance value that maps to pure palette shadow. Default 0.25.
- **midpointHigh** (0.5-1.0): luminance value that maps to pure palette highlight. Default 0.75.

Narrowing midpointLow/midpointHigh (e.g., 0.35/0.65) compresses the palette band and expands extension territory. Widening them (0.15/0.85) does the opposite.

### 5.3 Variant Generation

For a given palette entry and icon, Taliesin generates a fixed set of variants using different parameter combinations. The variant set is curated to cover the useful design space without overwhelming the user.

**Recommended default variant set (9 variants):**

| ID          | darkFactor | lightFactor | Notes                    |
| ----------- | ---------- | ----------- | ------------------------ |
| simple      | 0.0        | 0.0         | Two-stop, original       |
| subtle      | 0.2        | 0.2         | Minimal extension        |
| balanced    | 0.3        | 0.3         | Default recommendation   |
| strong      | 0.5        | 0.5         | Maximum symmetric        |
| deep-shadow | 0.5        | 0.2         | Dramatic, moody          |
| bright      | 0.2        | 0.5         | Airy, luminous           |
| contrast    | 0.5        | 0.5         | Same as strong, explicit |
| compressed  | 0.3        | 0.3         | with mid 0.35/0.65       |
| expanded    | 0.3        | 0.3         | with mid 0.15/0.85       |

Exact variant list is configurable per palette if needed.

### 5.4 Auto-Detection Heuristic

For each variant, compute a quality score based on:

1. **Tonal range preservation**: how closely the output's luminance distribution matches the source grayscale distribution. Compute histograms; score is 1 - sum(abs(source_hist - output_hist)) / 2.
2. **Contrast ratio**: ratio of 95th-percentile luminance to 5th-percentile luminance in output. Higher = more dynamic range.
3. **Midtone preservation**: percentage of output pixels within the palette-color band (between midpointLow and midpointHigh). Higher = stronger element identity.

Combined score = 0.5 × range_preservation + 0.3 × normalized_contrast + 0.2 × midtone_presence.

Variant with highest score gets the "Auto" badge in UI.

## 6. User Interface

### 6.1 Views

Three primary views, accessible from Taliesin's existing navigation:

#### 6.1.1 Palette Manager

- List of all palettes
- Per-palette detail view with entries listed
- Edit entry: name, shadow color (picker), highlight color (picker), default dark/light factors (sliders), notes
- Canonical test icon rendered in all entries using current palette values
- "Test against icon" dropdown to preview palette on any palette-mode asset
- Save/revert controls
- Export to client-ready format (if different from working format)

#### 6.1.2 Icon Calibration View

- Select asset (icon) and palette
- Grid of variants displayed side-by-side, rendered at icon size (256×256 or actual size)
- Each variant shows: rendered image, parameter summary, selection state
- "Auto" badge on algorithmically-selected variant
- "Custom" tile opens sliders for manual dark/light/midpoint control
- Selecting a variant saves calibration for this (asset, palette-entry) pair
- Navigation: previous/next palette entry, previous/next asset
- "Apply to all entries" option to use this variant config across all palette entries for this asset

#### 6.1.3 Batch Processor

- Select source folder (or asset pack category)
- Select target palette
- Options:
  - Use saved calibration if available (default: yes)
  - Use auto-detection for uncalibrated assets (default: yes)
  - Override with specific variant (ignores calibration)
  - Regenerate grayscale masters (default: only if missing)
- Preview: grid showing first N icons × all palette entries
- Output path configuration
- Progress indicator during processing
- Summary report on completion (successes, failures, skipped)

### 6.2 Preview Requirements

- Palette changes update live previews within 100ms for small icon counts
- Variant grid in calibration view renders all variants in parallel, target <500ms for 9 variants at 256×256
- Batch preview can be slower but should stream results as they render

### 6.3 Color Picker Requirements

- Standard hex input with validation
- Visual color picker (HSL or HSV wheel)
- Recent colors / palette history
- Eyedropper from currently-displayed image (nice-to-have for v1)

## 7. Processing Pipeline

### 7.1 Image Processing Library

Implementation in Electron renderer process using Canvas API or `sharp` (via Node backend) or a WebGL shader. Recommendation:

**For interactive UI rendering**: Canvas-based pixel manipulation in the renderer. Fast enough for preview, no IPC overhead, straightforward implementation.

**For batch processing**: Offload to Node process using `sharp` library (libvips bindings). Much faster for large batches, doesn't block UI.

Both paths share the same algorithm; implementation is duplicated in JS (for Canvas) and in a Node script (for sharp). Alternative: WebAssembly build of the algorithm usable from both contexts.

### 7.2 Grayscale Master Generation

When an asset is first processed, its grayscale master is generated and cached:

- Input: source color icon
- Output: grayscale PNG with alpha preserved
- Location: `{asset_pack}/masters/{asset_id}.png`
- Regenerate only if source is newer than master (mtime check) or if explicitly requested

Subsequent duotone operations work from the master, not the source. This matters because:

- Grayscale conversion is deterministic per source file
- Duotone operations don't need to re-do the luminance calculation
- If the source icon is updated, only the master needs regeneration; all calibrations remain valid

### 7.3 Output File Naming

Default output naming: `{asset_id}_{palette_id}_{entry_id}.png`

Example: `eagle_elements_fire.png`, `eagle_elements_dark.png`

Configurable via template string in palette settings or per-batch.

## 8. Integration Points

### 8.1 Game Client (MonoGame)

The MonoGame client consumes:

- Palette JSON files (for reference, logging, tool support)
- Colored output PNGs (for direct rendering)

Client does not need to re-execute the duotone algorithm. Output files are pre-baked.

If future runtime tinting is desired, client would instead consume:

- Palette JSON files
- Grayscale master PNGs
- Shader-based tinting code (see separate scope doc if this path is pursued)

### 8.2 Existing Taliesin Systems

- **Asset pack management**: icons processed through this system are still part of asset packs. Duotone outputs are additional files within the pack, not a separate concept.
- **Map editor**: no direct integration, but UI patterns should be consistent.
- **Music manager**: no integration.

### 8.3 Version Control

All system-generated files should be friendly to version control:

- JSON files use consistent key ordering and formatting
- Generated PNG files are deterministic (same input always produces same output)
- Calibration files don't contain timestamps that change on every read

## 9. Implementation Phases

### Phase 1: Palette Definition and Simple Processing

- Palette JSON schema and file format
- Single-palette manager UI (view/edit palette)
- Duotone algorithm in Canvas
- Single-icon processing with default parameters
- Output to file

### Phase 2: Variant Selection and Calibration

- Variant generation for a given icon + palette entry
- Variant grid UI with visual selection
- Auto-detection algorithm
- Calibration storage
- Calibration persistence and retrieval

### Phase 3: Batch Processing

- Folder-based batch operations
- Grayscale master generation and caching
- Progress reporting
- Output management

### Phase 4: Polish and Advanced Features

- Color picker improvements
- Canonical test icon for palette evaluation
- Multi-palette support (elements, status effects, factions, etc.)
- Custom variant configuration per palette
- Export to client-ready format if format diverges
- Performance optimization if needed

### Phase 5: Nice-to-Haves (Optional)

- Eyedropper color picker
- Palette import/export (share palettes between projects)
- Batch preview with element comparison grid
- Undo/redo for palette edits
- Palette version history

## 10. Open Questions

- **Does the MonoGame client need the palette JSON at runtime, or only the baked PNGs?** If only PNGs, palette JSON is purely a Taliesin artifact. If runtime, format must be stable and documented.
- **How are asset packs organized on disk?** Affects where palettes, calibrations, and masters live.
- **Is there a concept of "canonical test icon" per palette, or just per-project?** A test icon that shows how the palette looks and is used consistently for palette evaluation in the manager view.
- **Should calibrations be shared across similar icons, or always per-icon?** E.g., if all form-swap icons have similar tonal characteristics, maybe one calibration applies to all of them unless overridden.
- **Do you want palette categories / hierarchical palettes?** E.g., "elements > primary" and "elements > composite" as sub-palettes within a larger structure.
- **How should the system handle icons that should only generate variants for a subset of palette entries?** E.g., an icon that represents a fire ability and only needs Fire, Water, and Light variants, not all 17. Per-asset entry subset configuration.

## 11. Success Criteria

- Generating the initial 20-30 form-swap icons × 17 elements takes under one hour of calibration work, not 40+ hours of manual duotoning.
- Palette colors can be adjusted and all affected outputs regenerated in under five minutes.
- Adding a new palette (e.g., status effects) requires no code changes, only palette definition and asset tagging.
- Output quality is judged as acceptable by the project lead (you) without requiring per-icon manual correction in an external tool.
- Calibrated outputs are stable across runs — re-running the pipeline produces identical files.

## 12. References

- Standalone Python prototype: `duotone.py` (implements core algorithm and element palette, proves out the approach)
- Related methodology: fstop138.berrange.com article on GIMP duotone process (curves-based approach, mathematically equivalent to this system's simple mode)
- MonoGame shader alternative (not in scope for this document): see separate discussion on runtime tinting
