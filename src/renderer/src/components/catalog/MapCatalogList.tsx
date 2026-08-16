import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Box, Typography, Chip } from '@mui/material'
import { FilterField } from '../shared/FilterField'
import { CatalogEntry } from '../../hooks/useCatalog'
import { nextCursorIndex, isActivateKey, clampCursor } from '../../utils/listKeyboard'

interface Props {
  entries: CatalogEntry[]
  selectedFilename: string | null
  onSelect: (filename: string) => void
  /** Lets the page put focus back here — see MapCatalogListHandle. */
  ref?: React.Ref<MapCatalogListHandle>
}

/** What the page can do to this list from outside: take focus back (HTOO-426). */
export interface MapCatalogListHandle {
  focus: () => void
}

const ROW_HEIGHT = 52

const MapCatalogList: React.FC<Props> = ({ entries, selectedFilename, onSelect, ref }) => {
  const [search, setSearch] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) =>
        (e.mapNumber !== null && String(e.mapNumber).includes(q)) ||
        e.label.toLowerCase().includes(q) ||
        e.filename.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q)
    )
  }, [entries, search])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10
  })

  // ── Keyboard cursor ─────────────────────────────────────────────────────────
  //
  // The rows are virtualized, so a row scrolled out of the window is unmounted
  // and DOM focus on it would be lost. The cursor is therefore an index, the
  // scroll container holds focus, and the active row is named by
  // aria-activedescendant rather than focused.
  const [cursor, setCursor] = useState(-1)

  // Filtering changes the row count under the cursor.
  useEffect(() => {
    setCursor((c) => clampCursor(c, filtered.length))
  }, [filtered.length])

  // Follow a selection made elsewhere (a click, or the page restoring one), so
  // arrowing continues from the open map rather than from where the keyboard
  // last was.
  useEffect(() => {
    if (!selectedFilename) return
    const i = filtered.findIndex((e) => e.filename === selectedFilename)
    if (i >= 0) setCursor(i)
  }, [selectedFilename, filtered])

  // Keep the cursor row on screen. scrollToIndex is the virtualizer's job —
  // scrollIntoView cannot reach a row that is not rendered.
  useEffect(() => {
    if (cursor >= 0) virtualizer.scrollToIndex(cursor)
    // virtualizer identity changes every render; depending on it would scroll
    // on every keystroke in the search box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor])

  useImperativeHandle(ref, () => ({
    focus: () => listRef.current?.focus()
  }))

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const moved = nextCursorIndex(e.key, cursor, filtered.length)
      if (moved !== null) {
        e.preventDefault()
        setCursor(moved)
        return
      }
      if (isActivateKey(e.key) && cursor >= 0 && filtered[cursor]) {
        e.preventDefault()
        onSelect(filtered[cursor].filename)
      }
    },
    [cursor, filtered, onSelect]
  )

  // Entering the list with nothing under the cursor starts at the selected row,
  // or the top.
  const handleFocus = useCallback(() => {
    if (cursor >= 0 || filtered.length === 0) return
    const i = selectedFilename ? filtered.findIndex((e) => e.filename === selectedFilename) : -1
    setCursor(i >= 0 ? i : 0)
  }, [cursor, filtered, selectedFilename])

  // Down from the search box walks into the results, which is where the hand
  // wants to go after typing a filter.
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown') return
    e.preventDefault()
    listRef.current?.focus()
  }, [])

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        // `flex: 1`, not `height: 100%` — this list sits under a sibling toolbar
        // in CatalogPage's left panel, so 100% resolves against the whole panel
        // and overflows by exactly the toolbar's height (HTOO-354). `minHeight: 0`
        // is not optional: a flex item defaults to `min-height: auto` and refuses
        // to shrink below its content, and the virtualizer's sizer below is as
        // tall as every row in the directory.
        flex: 1,
        minHeight: 0,
        borderRight: '1px solid',
        borderColor: 'divider'
      }}
    >
      {/* Search bar */}
      <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <FilterField
          fullWidth
          placeholder="Search maps…"
          value={search}
          onChange={setSearch}
          onKeyDown={handleSearchKeyDown}
        />
      </Box>
      {/* Count */}
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          px: 1.5,
          py: 0.5,
          flexShrink: 0
        }}
      >
        {filtered.length} {filtered.length === 1 ? 'map' : 'maps'}
        {search && entries.length !== filtered.length && ` of ${entries.length}`}
      </Typography>
      {/* Virtualized list */}
      <Box
        ref={(el: HTMLDivElement | null) => {
          scrollRef.current = el
          listRef.current = el
        }}
        // The scroll container is the focusable element, not the rows: a
        // virtualized row unmounts when it scrolls away and would take focus
        // with it. aria-activedescendant names the current row instead.
        tabIndex={0}
        role="listbox"
        aria-label="Maps"
        aria-activedescendant={cursor >= 0 ? `mapcat-row-${cursor}` : undefined}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', outline: 'none' }}
      >
        <Box sx={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vItem) => {
            const entry = filtered[vItem.index]!
            const isSelected = entry.filename === selectedFilename
            const isCursor = vItem.index === cursor

            return (
              <Box
                key={entry.filename}
                id={`mapcat-row-${vItem.index}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  setCursor(vItem.index)
                  onSelect(entry.filename)
                }}
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
                  // The cursor row is drawn inside its own bounds. An outline
                  // would be clipped by the scroll container on the first and
                  // last rows, where it matters most.
                  boxShadow: isCursor ? (t) => `inset 0 0 0 2px ${t.palette.primary.main}` : 'none',
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
                      {entry.label}
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
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{
                        color: 'text.secondary',
                        display: 'block'
                      }}
                    >
                      {entry.name}
                    </Typography>
                  )}
                </Box>
                {entry.width != null && entry.height != null && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      flexShrink: 0
                    }}
                  >
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
