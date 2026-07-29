import React, { useMemo, useRef, useCallback } from 'react'
import { Box, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { DataArchiveEntry } from '@eriscorp/dalib-ts'
import { classifyEntry } from '../../utils/archiveRenderer'
import { formatBytes } from '../../utils/format'
import { useArchiveStore } from '../../store/archiveStore'

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Entries come from the store, and selection is an index — no `DataArchive` or
 * `DataArchiveEntry` crosses this boundary as a prop. See archiveStore.ts for
 * why that matters (React 19.2's dev prop diff walks the raw `.dat` buffer).
 */
interface Props {
  filter: string
  /** Index into `archive.entries`, or null when nothing is selected. */
  selectedIndex: number | null
  expandedGroups: Set<string>
  onSelect: (entryIndex: number) => void
  onToggleGroup: (ext: string) => void
}

interface GroupHeader {
  kind: 'header'
  ext: string
  count: number
  expanded: boolean
}

interface EntryRow {
  kind: 'entry'
  entry: DataArchiveEntry
  /** Position in `archive.entries` — the stable identity for selection. */
  index: number
}

type ListItem = GroupHeader | EntryRow

// ── Helpers ──────────────────────────────────────────────────────────────────

function getExt(entry: DataArchiveEntry): string {
  const name = entry.entryName.toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot) : '(none)'
}

const TYPE_ICONS: Record<string, string> = {
  sprite: '\u{1F5BC}', // framed picture
  palette: '\u{1F3A8}', // palette
  text: '\u{1F4C4}', // page
  audio: '\u{1F3B5}', // music note
  image: '\u{1F5BC}', // framed picture
  hex: '\u{1F4E6}' // package
}

// ── Component ────────────────────────────────────────────────────────────────

const ArchiveEntryList: React.FC<Props> = ({
  filter,
  selectedIndex,
  expandedGroups,
  onSelect,
  onToggleGroup
}) => {
  const parentRef = useRef<HTMLDivElement>(null)
  const archive = useArchiveStore((s) => s.archive)
  const entries = archive?.entries

  // Group + filter entries. Positions are carried through so selection stays an
  // index into the original `archive.entries`, unaffected by filtering.
  const items = useMemo<ListItem[]>(() => {
    if (!entries) return []
    const q = filter.trim().toLowerCase()

    // Group by extension
    const groups = new Map<string, EntryRow[]>()
    entries.forEach((entry, index) => {
      if (q && !entry.entryName.toLowerCase().includes(q)) return
      const e = getExt(entry)
      let list = groups.get(e)
      if (!list) {
        list = []
        groups.set(e, list)
      }
      list.push({ kind: 'entry', entry, index })
    })

    // Sort group keys
    const sortedKeys = [...groups.keys()].sort()

    // Build flat list with headers
    const result: ListItem[] = []
    for (const ext of sortedKeys) {
      const groupEntries = groups.get(ext)!
      const expanded = expandedGroups.has(ext)
      result.push({ kind: 'header', ext, count: groupEntries.length, expanded })
      if (expanded) result.push(...groupEntries)
    }
    return result
  }, [entries, filter, expandedGroups])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (items[i]?.kind === 'header' ? 36 : 32),
    overscan: 20
  })

  const handleClick = useCallback(
    (item: ListItem) => {
      if (item.kind === 'header') {
        onToggleGroup(item.ext)
      } else {
        onSelect(item.index)
      }
    },
    [onToggleGroup, onSelect]
  )

  return (
    <Box ref={parentRef} sx={{ flex: 1, overflow: 'auto' }}>
      <Box sx={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const item = items[vi.index]!
          if (item.kind === 'header') {
            return (
              <Box
                key={`hdr-${item.ext}`}
                onClick={() => handleClick(item)}
                sx={{
                  position: 'absolute',
                  top: vi.start,
                  height: vi.size,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  px: 1,
                  cursor: 'pointer',
                  bgcolor: 'action.hover',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.selected' }
                }}
              >
                {item.expanded ? (
                  <ExpandMoreIcon fontSize="small" sx={{ mr: 0.5 }} />
                ) : (
                  <ChevronRightIcon fontSize="small" sx={{ mr: 0.5 }} />
                )}
                <Typography variant="body2" sx={{ fontWeight: 'bold', mr: 1 }}>
                  {item.ext}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary'
                  }}
                >
                  ({item.count})
                </Typography>
              </Box>
            )
          }

          const entry = item.entry
          // By index, not name: duplicate entry names are legal in some archives.
          const isSelected = selectedIndex === item.index
          const icon = TYPE_ICONS[classifyEntry(entry)] ?? '\u{1F4E6}'

          return (
            <Box
              key={entry.entryName}
              onClick={() => handleClick(item)}
              sx={{
                position: 'absolute',
                top: vi.start,
                height: vi.size,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                px: 1,
                pl: 4,
                cursor: 'pointer',
                bgcolor: isSelected ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' }
              }}
            >
              <Typography variant="body2" sx={{ mr: 1, fontSize: '0.8rem', flexShrink: 0 }}>
                {icon}
              </Typography>
              <Typography variant="body2" noWrap sx={{ flex: 1, fontSize: '0.82rem' }}>
                {entry.entryName}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  flexShrink: 0,
                  ml: 1
                }}
              >
                {formatBytes(entry.fileSize)}
              </Typography>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

export default ArchiveEntryList
