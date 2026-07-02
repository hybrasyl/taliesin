import { useEffect, useState } from 'react'
import { PaletteSummary, scanPalettes } from '../../utils/paletteIO'

/**
 * Palette summaries for a pack dir, re-scanned whenever the tab becomes active
 * so palettes created in the Palettes tab appear without remounting. Shared by
 * BatchView and ColorizeView (ColorizeView still scans frames separately).
 */
export function usePalettesOnActive(packDir: string, active: boolean): PaletteSummary[] {
  const [summaries, setSummaries] = useState<PaletteSummary[]>([])
  useEffect(() => {
    if (!active) return
    scanPalettes(packDir)
      .then(setSummaries)
      .catch(() => setSummaries([]))
  }, [active, packDir])
  return summaries
}
