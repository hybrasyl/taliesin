import React, { useState } from 'react'
import { Button, Tooltip } from '@mui/material'
import BlockIcon from '@mui/icons-material/Block'
import {
  collisionsFromSotp,
  parseTileCollisionsXml,
  serializeTileCollisionsXml,
  validateTileCollisions,
  type SotpLike
} from '../../utils/tileCollisions'

/**
 * Seed the world's `TileCollisions` table from the client's `sotp.dat`
 * (HTOO-611, HXML-41).
 *
 * This is a one-time step for each world. After it, the table is the source of
 * tile walkability, and `sotp.dat` is the fallback. So the file is written only
 * where the author picks it, and the save dialog asks before it replaces a file.
 *
 * The folder name `tilecollisions` beside `elementtables` is a guess, to confirm
 * when HXML-41 merges and the server loads the table.
 */

const SUGGESTED_NAME = 'tile_collisions.xml'

/** Where the save dialog opens: the world's xml folder, when one is active. */
export function suggestedTileCollisionsPath(activeLibrary: string | null): string {
  if (!activeLibrary) return SUGGESTED_NAME
  const sep = activeLibrary.includes('\\') ? '\\' : '/'
  return `${activeLibrary.replace(/[\\/]+$/, '')}${sep}tilecollisions${sep}${SUGGESTED_NAME}`
}

/**
 * Build the file text, and check it as it will be read: the written XML is
 * parsed again and validated, so a fault in the writer stops the write.
 */
export function buildSeedXml(sotp: SotpLike): { xml: string; ranges: number; tiles: number } {
  const entries = collisionsFromSotp(sotp)
  const xml = serializeTileCollisionsXml(
    entries,
    `Seeded from sotp.dat by Taliesin (tile ids 1-${sotp.maxTileId}). This table is the source of tile walkability now; sotp.dat is the fallback.`
  )
  const errors = validateTileCollisions(parseTileCollisionsXml(xml))
  if (errors.length > 0) {
    throw new Error(`The TileCollisions output is not valid: ${errors.slice(0, 3).join('; ')}`)
  }
  return {
    xml,
    ranges: entries.filter((e) => e.kind === 'range').length,
    tiles: entries.filter((e) => e.kind === 'tile').length
  }
}

export default function TileCollisionsSeedButton({
  sotp,
  activeLibrary,
  onStatus
}: {
  sotp: SotpLike | null
  activeLibrary: string | null
  onStatus: (message: string) => void
}): React.ReactElement {
  const [busy, setBusy] = useState(false)

  const seed = async (): Promise<void> => {
    if (!sotp) return
    setBusy(true)
    try {
      const { xml, ranges, tiles } = buildSeedXml(sotp)
      const path = await window.api.saveFile(
        [{ name: 'TileCollisions XML', extensions: ['xml'] }],
        suggestedTileCollisionsPath(activeLibrary)
      )
      if (!path) return
      await window.api.writeFile(path, xml)
      onStatus(`Wrote TileCollisions: ${ranges} ranges and ${tiles} tiles`)
    } catch (e) {
      onStatus(`TileCollisions not written: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Tooltip
      title={
        sotp
          ? 'Write the world TileCollisions table from the client sotp.dat (a one-time seed for each world)'
          : 'Set a client path in Settings: the seed reads sotp.dat from ia.dat'
      }
    >
      <span>
        <Button
          size="small"
          variant="outlined"
          startIcon={<BlockIcon fontSize="small" />}
          onClick={() => void seed()}
          disabled={!sotp || busy}
        >
          Seed TileCollisions…
        </Button>
      </span>
    </Tooltip>
  )
}
