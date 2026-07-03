import { z } from 'zod'
import type { AssetTargetPath, PackKind, PackProject, SlotIdentity } from './types'

// ui_panels: XML panel layouts + convention-named PNG art, authored in the
// UI Layout Forge page (not the generic asset table). Format contract:
// docs/ui-panel-layout-format.md. First schema_version-2 content type.

const LAYOUT_RE = /^([a-z0-9_]+)\.xml$/
const BACKGROUND_RE = /^([a-z0-9_]+)_bg\.png$/
const CONTROL_ART_RE = /^([a-z0-9_]+)_(normal|pressed|disabled)\.png$/

const coversSchema = z.object({
  ui_panels: z.object({
    panel_ids: z.array(z.string()),
    variables_used: z.array(z.string()).optional()
  })
})

function parseSlot(relPath: string): SlotIdentity | null {
  // Design-spec markdown lives in the project dir but is never pack content.
  if (relPath.startsWith('specs/')) return null
  if (LAYOUT_RE.test(relPath)) return { namespace: 'layout', id: 0 }
  if (BACKGROUND_RE.test(relPath)) return { namespace: 'background', id: 0 }
  if (CONTROL_ART_RE.test(relPath)) return { namespace: 'art', id: 0 }
  return null
}

/** panel_ids derives from which {panel_id}.xml files ship. variables_used
 *  needs parsed XML, so the Forge computes it at its own save/compile time;
 *  this reducer only keeps panel_ids honest for edits made via PackEditor. */
function reduceCoversFromMeta(draft: PackProject): Record<string, unknown> | undefined {
  const panelIds = draft.assets
    .map((a) => LAYOUT_RE.exec(a.filename)?.[1])
    .filter((id): id is string => !!id)
    .sort()
  const prev = (draft.covers.ui_panels ?? {}) as Record<string, unknown>
  return { ui_panels: { ...prev, panel_ids: panelIds } }
}

export const uiPanelsKind: PackKind = {
  type: 'ui_panels',
  label: 'UI Panel Layouts',
  description:
    'XML panel layouts with variable bindings plus convention-named PNG art ({panel}.xml, {panel}_bg.png, {panel}_{control}_{state}.png). Author in the UI Layout Forge page; this table is for raw file management only.',
  manifestSchemaVersion: 2,
  fileExtensions: ['png', 'xml'],
  defaultCovers: () => ({ ui_panels: { panel_ids: [] } }),
  coversSchema,
  parseSlot,
  reduceCoversFromMeta,
  nextAssetPath({ ctx }): AssetTargetPath {
    const stem = String(ctx?.namespace ?? '').trim()
    if (!stem) {
      throw new Error('ui_panels nextAssetPath requires ctx.namespace (the target filename stem)')
    }
    const filename = `${stem}.png`
    return { zipPath: filename, relPath: filename }
  },
  customNamespacePrompt: {
    menuLabel: 'Add art by filename…',
    dialogTitle: 'Add UI panel art',
    dialogHelp:
      'Target PNG filename stem per the ui_panels convention, e.g. extstats_bg or extstats_expand_btn_normal. Layout XML files are authored in the UI Layout Forge.',
    inputLabel: 'Filename stem'
  }
}
