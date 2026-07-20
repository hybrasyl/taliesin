import React, { useMemo, useState } from 'react'
import {
  Box,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ArchiveIcon from '@mui/icons-material/Archive'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import ViewListIcon from '@mui/icons-material/ViewList'
import FolderIcon from '@mui/icons-material/Folder'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import { useSettingsStore } from '../../store/settingsStore'
import { allFolderPaths, buildFileTree, flattenTree, type TreeFile } from '../../utils/fileTree'

const INDENT_STEP = 1.5

export interface SectionFileListProps<T extends TreeFile> {
  /** Panel heading — "Maps", "World Maps". */
  title: string
  files: T[]
  /** The `.ignore` set: archived maps, world map templates. */
  archivedFiles: T[]
  /** What the archived set is called here. */
  archivedLabel: string
  showArchived: boolean
  onToggleArchived: () => void
  /** Does this row survive the filter box? Callers decide what is searchable —
   *  the map editor matches display name, map name and `lod<id>`. */
  matches: (file: T, query: string) => boolean
  /** The row itself, minus indentation and grouping. */
  renderRow: (file: T, muted: boolean) => React.ReactElement
  /** Anything pinned above the list inside the scroll area (the world map
   *  editor's Reference Set block). Receives the live filter query so it can
   *  hide itself when it doesn't match. */
  header?: (query: string) => React.ReactNode
  /** Whether {@link header} is showing something for this query — keeps a
   *  "No matches." line from appearing above a header row that did match. */
  headerMatches?: (query: string) => boolean
  /** Shown when there are no files at all, as opposed to no matches. */
  emptyMessage: string
  /** Buttons beside the toggles — "New". */
  actions?: React.ReactNode
}

/**
 * The file list both XML editors sit behind: filter box, active/archived split,
 * and a flat-or-folder view of rows whose identity is a type-relative rel path.
 *
 * Folder mode groups by {@link buildFileTree} and renders a *flat* row list so
 * row heights and scrolling stay uniform (and so it can be virtualized later
 * without restructuring). Rows stay caller-supplied because the two editors show
 * quite different secondaries.
 */
export default function SectionFileList<T extends TreeFile>({
  title,
  files,
  archivedFiles,
  archivedLabel,
  showArchived,
  onToggleArchived,
  matches,
  renderRow,
  header,
  headerMatches,
  emptyMessage,
  actions
}: SectionFileListProps<T>): React.ReactElement {
  const [search, setSearch] = useState('')
  const viewMode = useSettingsStore((s) => s.fileListViewMode)
  const setViewMode = useSettingsStore((s) => s.setFileListViewMode)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  const query = search.trim().toLowerCase()
  const filteredActive = useMemo(
    () => (query ? files.filter((f) => matches(f, query)) : files),
    [files, query, matches]
  )
  const filteredArchived = useMemo(
    () => (query ? archivedFiles.filter((f) => matches(f, query)) : archivedFiles),
    [archivedFiles, query, matches]
  )

  const toggleFolder = (path: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  /**
   * Folders default to open and `collapsed` records the exceptions, so a folder
   * that only appears once the filter narrows things down is already open.
   * A live filter opens everything regardless — reconciling manual collapses
   * against a changing result set would just hide matches.
   */
  const renderList = (list: T[], muted: boolean): React.ReactElement => {
    if (viewMode === 'flat') {
      return (
        <List dense disablePadding>
          {list.map((f) => (
            <React.Fragment key={f.rel}>{renderRow(f, muted)}</React.Fragment>
          ))}
        </List>
      )
    }

    const tree = buildFileTree(list)
    const expanded = query
      ? allFolderPaths(tree)
      : new Set([...allFolderPaths(tree)].filter((p) => !collapsed.has(p)))
    const rows = flattenTree(tree, expanded)

    return (
      <List dense disablePadding>
        {rows.map((row) =>
          row.kind === 'folder' ? (
            <ListItem key={row.key} disablePadding sx={{ pl: row.depth * INDENT_STEP }}>
              <ListItemButton onClick={() => toggleFolder(row.path)} sx={{ py: 0.25 }}>
                {expanded.has(row.path) ? (
                  <KeyboardArrowDownIcon fontSize="small" sx={{ mr: 0.5, opacity: 0.7 }} />
                ) : (
                  <KeyboardArrowRightIcon fontSize="small" sx={{ mr: 0.5, opacity: 0.7 }} />
                )}
                {expanded.has(row.path) ? (
                  <FolderOpenIcon fontSize="small" sx={{ mr: 0.75, color: 'text.secondary' }} />
                ) : (
                  <FolderIcon fontSize="small" sx={{ mr: 0.75, color: 'text.secondary' }} />
                )}
                <ListItemText
                  primary={row.name}
                  secondary={row.count}
                  slotProps={{
                    primary: { noWrap: true, variant: 'body2', sx: { fontWeight: 600 } },
                    secondary: { variant: 'caption' }
                  }}
                  sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, my: 0 }}
                />
              </ListItemButton>
            </ListItem>
          ) : (
            <Box key={row.key} sx={{ pl: (row.depth + 1) * INDENT_STEP }}>
              {renderRow(row.file, muted)}
            </Box>
          )
        )}
      </List>
    )
  }

  // `headerMatches('')` answers "does the header render anything at all?" — a
  // world with only a Reference Set is not an empty section.
  const nothingAtAll =
    files.length === 0 && (!showArchived || archivedFiles.length === 0) && !headerMatches?.('')
  const noMatches =
    filteredActive.length === 0 &&
    (!showArchived || filteredArchived.length === 0) &&
    !nothingAtAll &&
    !headerMatches?.(query)

  return (
    <Box
      sx={{
        width: 240,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title={viewMode === 'folder' ? 'Flat View' : 'Folder View'}>
            <IconButton
              size="small"
              onClick={() => setViewMode(viewMode === 'folder' ? 'flat' : 'folder')}
              color={viewMode === 'folder' ? 'primary' : 'default'}
            >
              {viewMode === 'folder' ? (
                <AccountTreeIcon fontSize="small" />
              ) : (
                <ViewListIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title={showArchived ? `Hide ${archivedLabel}` : `Show ${archivedLabel}`}>
            <IconButton
              size="small"
              onClick={onToggleArchived}
              color={showArchived ? 'primary' : 'default'}
            >
              <ArchiveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {actions}
        </Box>
      </Box>
      <Box sx={{ px: 1, pb: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Filter..."
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
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {header?.(query)}
        {nothingAtAll ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 2 }}>
            {emptyMessage}
          </Typography>
        ) : noMatches ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 2 }}>
            No matches.
          </Typography>
        ) : (
          <>
            {filteredActive.length > 0 && renderList(filteredActive, false)}
            {showArchived && filteredArchived.length > 0 && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', px: 1.5, py: 0.5, display: 'block' }}
                >
                  {archivedLabel}
                </Typography>
                {renderList(filteredArchived, true)}
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
