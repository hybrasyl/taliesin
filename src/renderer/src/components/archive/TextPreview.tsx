import React, { useMemo } from 'react'
import { Box, Typography } from '@mui/material'
import { ColorTable, type DataArchive, type DataArchiveEntry } from '@eriscorp/dalib-ts'
import { formatBytes } from '../../utils/format'

// Cap how much text we decode/render. Far larger than any real DA text/.tbl
// asset; guards against a huge (or mis-typed binary) entry making the DOM text
// node pathological to lay out.
export const MAX_TEXT_PREVIEW_BYTES = 256 * 1024

// Real .tbl dye tables begin with a small "colors per entry" count (~6). Other
// .tbl files (palette/cycling tables, or binary blobs) are NOT dye tables: when
// their first line decodes to a huge number, ColorTable.parseText allocates that
// many color objects PER entry with no cap and without stopping at EOF — a 40 KB
// file can exhaust the heap (OOM). Only hand the buffer to the parser when the
// header looks like a real dye table.
const MAX_COLORS_PER_ENTRY = 64

export function tryParseColorTable(buf: Uint8Array): ColorTable | null {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(0, 64))
  const firstLine = (head.split(/\r?\n/, 1)[0] ?? '').trim()
  if (!/^\d+$/.test(firstLine)) return null
  const colorsPerEntry = parseInt(firstLine, 10)
  if (!(colorsPerEntry >= 1 && colorsPerEntry <= MAX_COLORS_PER_ENTRY)) return null
  try {
    const parsed = ColorTable.fromBuffer(buf)
    return parsed.entries.length > 0 ? parsed : null
  } catch {
    return null
  }
}

export const TextPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const { text, truncatedBytes, colorTable } = useMemo(() => {
    const buf = archive.getEntryBuffer(entry)
    const truncatedBytes =
      buf.length > MAX_TEXT_PREVIEW_BYTES ? buf.length - MAX_TEXT_PREVIEW_BYTES : 0
    const slice = truncatedBytes > 0 ? buf.subarray(0, MAX_TEXT_PREVIEW_BYTES) : buf
    const text = new TextDecoder('utf-8', { fatal: false }).decode(slice)
    // Try parsing .tbl files as a ColorTable (dye table). If it has entries,
    // render the swatches above the raw text. Most .tbl files are not dye
    // tables and will return null — those just show plain text.
    const colorTable = entry.entryName.toLowerCase().endsWith('.tbl')
      ? tryParseColorTable(buf)
      : null
    return { text, truncatedBytes, colorTable }
  }, [entry, archive])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minHeight: 0 }}>
      {colorTable && <ColorTableSwatches table={colorTable} />}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 1,
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          fontFamily: 'monospace',
          fontSize: '0.78rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}
      >
        {text}
      </Box>
      {truncatedBytes > 0 && (
        <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
          Preview truncated — {formatBytes(truncatedBytes)} more not shown. Use Extract Raw for the
          full file.
        </Typography>
      )}
    </Box>
  )
}

// Cap rendered dye-table rows so a large table can't spawn thousands of styled
// swatch Boxes (each is an Emotion-styled node). Real dye tables are tiny.
const MAX_SWATCH_ROWS = 512

const ColorTableSwatches: React.FC<{ table: ColorTable }> = ({ table }) => {
  const shown = table.entries.slice(0, MAX_SWATCH_ROWS)
  const hidden = table.entries.length - shown.length
  return (
    <Box
      sx={{
        flexShrink: 0,
        p: 1,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        maxHeight: '40%',
        overflow: 'auto'
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          display: 'block',
          mb: 0.5
        }}
      >
        ColorTable · {table.entries.length} {table.entries.length === 1 ? 'entry' : 'entries'}
        {hidden > 0 && ` (showing first ${MAX_SWATCH_ROWS})`}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {shown.map((entry, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="caption"
              sx={{ fontFamily: 'monospace', minWidth: 32, color: 'text.secondary' }}
            >
              #{entry.colorIndex}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.25 }}>
              {entry.colors.map((c, j) => (
                <Box
                  key={j}
                  sx={{
                    width: 16,
                    height: 16,
                    bgcolor: `rgb(${c.r}, ${c.g}, ${c.b})`,
                    border: '1px solid',
                    borderColor: 'divider'
                  }}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export default TextPreview
