import React, { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Box, Typography, TextField, InputAdornment, Chip } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { CatalogEntry } from '../../hooks/useCatalog'

interface Props {
  entries: CatalogEntry[]
  selectedFilename: string | null
  onSelect: (filename: string) => void
}

const ROW_HEIGHT = 52

const MapCatalogList: React.FC<Props> = ({ entries, selectedFilename, onSelect }) => {
  const [search, setSearch] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const filtered = search.trim()
    ? entries.filter((e) => {
        const q = search.toLowerCase()
        return (
          String(e.mapNumber).includes(q) ||
          e.filename.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q)
        )
      })
    : entries

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10
  })

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRight: '1px solid',
        borderColor: 'divider'
      }}
    >
      {/* Search bar */}
      <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search maps…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }
          }}
        />
      </Box>

      {/* Count */}
      <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 0.5, flexShrink: 0 }}>
        {filtered.length} {filtered.length === 1 ? 'map' : 'maps'}
        {search && entries.length !== filtered.length && ` of ${entries.length}`}
      </Typography>

      {/* Virtualized list */}
      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <Box sx={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vItem) => {
            const entry = filtered[vItem.index]!
            const isSelected = entry.filename === selectedFilename

            return (
              <Box
                key={entry.filename}
                onClick={() => onSelect(entry.filename)}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                  transform: `translateY(${vItem.start}px)`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  cursor: 'pointer',
                  bgcolor: isSelected ? 'action.selected' : 'transparent',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' }
                }}
              >
                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ color: 'text.button', fontWeight: 500 }}
                    >
                      lod{entry.mapNumber}
                    </Typography>
                    {entry.variant && (
                      <Chip
                        label={entry.variant}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.65rem' }}
                      />
                    )}
                  </Box>
                  {entry.name && (
                    <Typography variant="caption" noWrap color="text.secondary" display="block">
                      {entry.name}
                    </Typography>
                  )}
                </Box>
                {entry.width != null && entry.height != null && (
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {entry.width}×{entry.height}
                  </Typography>
                )}
              </Box>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}

export default MapCatalogList
