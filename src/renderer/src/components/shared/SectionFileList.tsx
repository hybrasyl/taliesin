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
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess'
import { useSettingsStore } from '../../store/settingsStore'
import {
  allFolderPaths,
  buildFileTree,
  flattenTree,
  type FolderNode,
  type TreeFile
} from '../../utils/fileTree'

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
  // Folders start closed and `expanded` records the exceptions — the same rule
  // creidhne's EditorFileListPanel uses, so the two trees behave alike. One Set
  // covers the active and the archived list: a folder is the same folder in
  // both. Expansion is not persisted; a live filter opens everything anyway.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

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
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const folderMode = viewMode === 'folder'

  // The trees are built here rather than in renderList so that expanding one
  // folder does not re-group every file, and so the expand-all button can read
  // the folder set both lists contribute.
  const activeTree = useMemo(
    () => (folderMode ? buildFileTree(filteredActive) : null),
    [folderMode, filteredActive]
  )
  const archivedTree = useMemo(
    () => (folderMode && showArchived ? buildFileTree(filteredArchived) : null),
    [folderMode, showArchived, filteredArchived]
  )

  const allFolders = useMemo(() => {
    const paths = new Set<string>()
    for (const tree of [activeTree, archivedTree]) {
      if (!tree) continue
      for (const path of allFolderPaths(tree)) paths.add(path)
    }
    return paths
  }, [activeTree, archivedTree])

  // Measured against the folder set, not against a count: a folder that is
  // opened, filtered away, then restored leaves the two sets the same size and
  // different.
  const allExpanded = allFolders.size > 0 && [...allFolders].every((p) => expanded.has(p))
  const toggleExpandAll = (): void => setExpanded(allExpanded ? new Set() : new Set(allFolders))

  /**
   * A live filter opens every surviving folder. The filtered tree holds only the
   * matches and their ancestors, so showing all of it is what the user asked
   * for, and no manual collapse has to be reconciled against a changing result
   * set.
   */
  const renderList = (
    list: T[],
    tree: FolderNode<T> | null,
    muted: boolean
  ): React.ReactElement => {
    if (!tree) {
      return (
        <List dense disablePadding>
          {list.map((f) => (
            <React.Fragment key={f.rel}>{renderRow(f, muted)}</React.Fragment>
          ))}
        </List>
      )
    }

    const open = query ? allFolderPaths(tree) : expanded
    const rows = flattenTree(tree, open)

    return (
      <List dense disablePadding>
        {rows.map((row) =>
          row.kind === 'folder' ? (
            <ListItem key={row.key} disablePadding sx={{ pl: row.depth * INDENT_STEP }}>
              <ListItemButton onClick={() => toggleFolder(row.path)} sx={{ py: 0.25 }}>
                {open.has(row.path) ? (
                  <KeyboardArrowDownIcon fontSize="small" sx={{ mr: 0.5, opacity: 0.7 }} />
                ) : (
                  <KeyboardArrowRightIcon fontSize="small" sx={{ mr: 0.5, opacity: 0.7 }} />
                )}
                {open.has(row.path) ? (
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
          <Tooltip title={folderMode ? 'Flat View' : 'Folder View'}>
            <IconButton
              size="small"
              onClick={() => setViewMode(folderMode ? 'flat' : 'folder')}
              color={folderMode ? 'primary' : 'default'}
            >
              {folderMode ? (
                <AccountTreeIcon fontSize="small" />
              ) : (
                <ViewListIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          {folderMode && allFolders.size > 0 && (
            // Disabled while filtering, not hidden: the filter already opens
            // every surviving folder, so the button would look broken. Say why.
            <Tooltip
              title={
                query
                  ? 'Filtering already shows every match'
                  : allExpanded
                    ? 'Collapse all folders'
                    : 'Expand all folders'
              }
            >
              <span>
                <IconButton
                  size="small"
                  onClick={toggleExpandAll}
                  disabled={!!query}
                  aria-label={allExpanded ? 'Collapse all folders' : 'Expand all folders'}
                >
                  {allExpanded ? (
                    <UnfoldLessIcon fontSize="small" />
                  ) : (
                    <UnfoldMoreIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}
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
            {filteredActive.length > 0 && renderList(filteredActive, activeTree, false)}
            {showArchived && filteredArchived.length > 0 && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', px: 1.5, py: 0.5, display: 'block' }}
                >
                  {archivedLabel}
                </Typography>
                {renderList(filteredArchived, archivedTree, true)}
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
