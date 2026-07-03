import type { UiControlKind } from './types'

/**
 * Art filename conventions for ui_panels packs (see
 * docs/ui-panel-layout-format.md § Pack structure). All art is flat at the
 * pack root; coverage is emergent from which PNGs ship. These helpers are the
 * single source of truth the Forge writes and reads against.
 */

export type ControlArtState = 'normal' | 'pressed' | 'disabled'

/** Per-variant background: `{panel}_{variant}_bg.png`. */
export function backgroundFilename(panelId: string, variantName: string): string {
  return `${panelId}_${variantName}_bg.png`
}

/** Per-control state art: `{panel}_{control}_{state}.png`. */
export function controlArtFilename(
  panelId: string,
  controlName: string,
  state: ControlArtState
): string {
  return `${panelId}_${controlName}_${state}.png`
}

/**
 * Which art states a control kind can carry. Buttons have full pressed/disabled
 * states; images and progressbars have a single normal frame; text controls
 * (label/textbox) are text-driven and carry none.
 */
export function artStatesForKind(kind: UiControlKind): ControlArtState[] {
  switch (kind) {
    case 'button':
      return ['normal', 'pressed', 'disabled']
    case 'image':
    case 'progressbar':
      return ['normal']
    case 'label':
    case 'textbox':
      return []
  }
}
