import React, { useMemo } from 'react'
import { Box, Chip, Typography } from '@mui/material'
import type { DataArchive, DataArchiveEntry } from '@eriscorp/dalib-ts'
import {
  readTypedTable,
  MAX_TABLE_ROWS,
  TBL_KIND_LABELS,
  type TypedTable
} from '../../utils/tblTables'
import TextPreview from './TextPreview'

/**
 * Preview for `.tbl` entries.
 *
 * Five formats share the extension. Four get a structured table here; the fifth,
 * the dye `ColorTable`, is left to `TextPreview`, which owns that parser's guard
 * and renders the swatches. Anything unidentified falls back to plain text — the
 * viewer says what it knows and does not guess.
 *
 * The dye table is reached by falling through rather than by checking for it
 * first, and the order matters: a small `effect.tbl` opens with a low count
 * line, which is exactly what `tryParseColorTable`'s header sniff accepts, so
 * testing for a dye table up front misreads every short effect table as one.
 * `readTypedTable` identifies by entry name before structure, and no dye table
 * can satisfy its grammars — their `r,g,b` lines are not whitespace-separated
 * integers.
 */

const cellSx = {
  fontFamily: 'monospace',
  fontSize: '0.78rem',
  py: 0.25,
  pr: 2,
  whiteSpace: 'nowrap' as const,
  verticalAlign: 'top' as const
}

const headSx = {
  ...cellSx,
  fontWeight: 'bold',
  color: 'text.secondary',
  borderBottom: '1px solid',
  borderColor: 'divider',
  position: 'sticky' as const,
  top: 0,
  bgcolor: 'background.default'
}

/** Column headings and a row-to-cells reader, per table kind. */
function columnsFor(table: TypedTable): { headers: string[]; rows: string[][] } {
  switch (table.kind) {
    case 'palette-map':
      return {
        headers: ['Ids', 'Palette', 'Applies to'],
        rows: table.rows.map((r) => [
          r.start === r.end ? String(r.start) : `${r.start}–${r.end}`,
          r.palette >= 1000 ? `${r.palette - 1000} (luminance blended)` : String(r.palette),
          r.kind === 'range'
            ? 'range'
            : r.kind === 'override'
              ? 'single id'
              : r.kind === 'male'
                ? 'male override'
                : 'female override'
        ])
      }
    case 'palette-cycling':
      return {
        headers: ['Palette indices', 'Step every'],
        rows: table.rows.map((r) => [
          r.startIndex === r.endIndex ? String(r.startIndex) : `${r.startIndex}–${r.endIndex}`,
          `${r.period * 100} ms`
        ])
      }
    case 'tile-animation':
      return {
        headers: ['Tile sequence', 'Frames', 'Interval'],
        rows: table.rows.map((r) => [
          r.tileSequence.join(' → '),
          String(r.tileSequence.length),
          `${r.intervalMs} ms`
        ])
      }
    case 'effect':
      return {
        headers: ['Effect', 'Frame sequence', 'Frames'],
        rows: table.rows.map((r) => [
          String(r.effectId),
          r.frameSequence.length > 0 ? r.frameSequence.join(' → ') : '(empty slot)',
          String(r.frameSequence.length)
        ])
      }
  }
}

const TypedTableView: React.FC<{ table: TypedTable }> = ({ table }) => {
  const { headers, rows } = columnsFor(table)
  const hidden = table.total - table.rows.length

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>
        <Chip size="small" label={TBL_KIND_LABELS[table.kind]} />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {table.total} {table.total === 1 ? 'row' : 'rows'}
          {hidden > 0 && ` (showing first ${MAX_TABLE_ROWS})`} · identified by {table.rule}
        </Typography>
      </Box>
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 1,
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1
        }}
      >
        <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
          <Box component="thead">
            <Box component="tr">
              {headers.map((h) => (
                <Box component="th" key={h} sx={{ ...headSx, textAlign: 'left' }}>
                  {h}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {rows.map((cells, i) => (
              <Box component="tr" key={i}>
                {cells.map((cell, j) => (
                  <Box component="td" key={j} sx={cellSx}>
                    {cell}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      {hidden > 0 && (
        <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
          {hidden} more {hidden === 1 ? 'row' : 'rows'} not shown. Use Extract Raw for the full
          file.
        </Typography>
      )}
    </Box>
  )
}

const TblPreview: React.FC<{ entry: DataArchiveEntry; archive: DataArchive }> = ({
  entry,
  archive
}) => {
  const table = useMemo(
    () => readTypedTable(entry.entryName, archive.getEntryBuffer(entry)),
    [entry, archive]
  )

  if (!table) return <TextPreview entry={entry} archive={archive} />
  return <TypedTableView table={table} />
}

export default TblPreview
