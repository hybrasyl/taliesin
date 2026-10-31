import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import { FilterField } from './FilterField'
import { EditorAlertsProvider } from './EditorAlerts'
import AddIcon from '@mui/icons-material/Add'
import ArchiveIcon from '@mui/icons-material/Archive'
import UnarchiveIcon from '@mui/icons-material/Unarchive'
import PendingActionsIcon from '@mui/icons-material/PendingActions'
import PublishIcon from '@mui/icons-material/Publish'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import ViewListIcon from '@mui/icons-material/ViewList'
import FolderIcon from '@mui/icons-material/Folder'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess'
import { useSettingsStore } from '../../store/settingsStore'
import { nextCursorIndex } from '../../utils/listKeyboard'
import {
  allFolderPaths,
  buildFileTree,
  flattenTree,
  type FolderNode,
  type TreeFile
} from '../../utils/fileTree'

const INDENT_STEP = 1.5

/** The width of the file list, and of the toolbar cell above it. */
export const FILE_LIST_WIDTH = 240

/** A row the panel can act on. `path` is the selection's identity. */
export interface PanelFile extends TreeFile {
  path: string
  archived?: boolean
  /** In `<world>/.staging/<type>/` (HTOO-634). */
  staged?: boolean
}

type SetKey = 'active' | 'staged' | 'archived'

/** An item action the page has, which does not apply to the selection. The
 *  string is the tooltip that says why. */
export interface DisabledActions {
  archive?: string
  stage?: string
  copy?: string
  delete?: string
}

export interface EditorFileListPanelProps<T extends PanelFile> {
  /** The page name — "Maps", "World Maps". */
  title: string
  /** Lowercase singular — "map", "world map". */
  entityLabel: string
  files: T[]
  /** The `.ignore` set: archived maps, world map templates. */
  archivedFiles: T[]
  /** What the archived set is called here. */
  archivedLabel: string
  /** The open file. The item actions act on it. */
  selectedFile: T | null
  /** Does this row survive the filter box? Callers decide what is searchable —
   *  the map editor matches display name, map name and `lod<id>`. */
  matches: (file: T, query: string) => boolean
  /** The row itself, minus indentation and grouping. */
  renderRow: (file: T, muted: boolean) => React.ReactElement
  /** Anything pinned above the sets inside the scroll area (the world map
   *  editor's Reference Set block). Receives the live filter query so it can
   *  hide itself when it doesn't match. */
  header?: (query: string) => React.ReactNode
  /** Whether {@link header} is showing something for this query — keeps a
   *  "No matches." line from appearing above a header row that did match. */
  headerMatches?: (query: string) => boolean
  /** Shown when there are no files at all, as opposed to no matches. */
  emptyMessage: string
  onNew: () => void
  /** The toolbar labels for the archive action — "Archive", "Move to
   *  Templates" — and its reverse. */
  archiveLabel?: string
  unarchiveLabel?: string
  onArchive?: (file: T) => void
  onUnarchive?: (file: T) => void
  onDuplicate?: (file: T) => void
  /** Called after the user confirms. */
  onDelete?: (file: T) => void
  /** Item actions the page has that do not apply to the selection. */
  disabledActions?: DisabledActions
  /** Staging (HTOO-634). A page that passes `onStage` and `onRelease` gets the
   *  Staged set and the Stage action, which is Release for a staged file. */
  stagedFiles?: T[]
  onStage?: (file: T) => void
  onRelease?: (file: T) => void
  /** The page's editor column. */
  children: React.ReactNode
}

/** An icon button with a tooltip that still shows while the button is disabled. */
function ToolbarButton({
  title,
  label,
  disabled,
  onClick,
  children
}: {
  title: string
  label: string
  disabled?: boolean
  onClick: (e: React.MouseEvent<HTMLElement>) => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" disabled={disabled} onClick={onClick} aria-label={label}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  )
}

/**
 * The shell of a world XML editor page (HTOO-633, from Creidhne's HTOO-628
 * `EditorFileListPanel.jsx`): a toolbar across the page, the file list on the
 * left, and the page's editor column (`children`) on the right.
 *
 *   (Page name) | (New) | (Flat) (Staged) (Archived) (Active) | (Archive) (Stage) (Copy) (Delete)
 *
 * One component owns the toolbar and the list, because the toolbar's item
 * actions act on the list's selection. It also puts the alerts provider
 * (`EditorAlerts.tsx`) around the editor column, so a notice anywhere in the
 * column shows under the editor header.
 *
 * The set toggles choose what the list shows. Active is the default, and at
 * least one set stays on. Each shown set has a header row with its count, and a
 * click on the header collapses or expands the set.
 *
 * The selection is the open file, one at a time: Taliesin's editors do not take
 * Creidhne's multi-select. An item action is enabled only when it applies to
 * the open file. Archive becomes Unarchive for an archived file, and Stage
 * becomes Release for a staged file. Staging has no archive, so a staged file
 * cannot be archived, and an archived file cannot be staged.
 *
 * The list is not virtualized. Its rows are real ListItemButtons, so they hold
 * focus themselves and Enter and Space activate them. Folder mode groups each
 * set by {@link buildFileTree} and renders a flat row list, so row heights and
 * scrolling stay uniform.
 */
export default function EditorFileListPanel<T extends PanelFile>({
  title,
  entityLabel,
  files,
  archivedFiles,
  archivedLabel,
  selectedFile,
  matches,
  renderRow,
  header,
  headerMatches,
  emptyMessage,
  onNew,
  archiveLabel = 'Archive',
  unarchiveLabel = 'Unarchive',
  onArchive,
  onUnarchive,
  onDuplicate,
  onDelete,
  disabledActions = {},
  stagedFiles = [],
  onStage,
  onRelease,
  children
}: EditorFileListPanelProps<T>): React.ReactElement {
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState<SetKey[]>(['active'])
  const [collapsedSets, setCollapsedSets] = useState<ReadonlySet<SetKey>>(() => new Set())
  const [pendingDelete, setPendingDelete] = useState<T | null>(null)
  const viewMode = useSettingsStore((s) => s.fileListViewMode)
  const setViewMode = useSettingsStore((s) => s.setFileListViewMode)
  // Folders start closed and `expanded` records the exceptions — the same rule
  // creidhne's EditorFileListPanel uses, so the two trees behave alike. One Set
  // covers the active and the archived list: a folder is the same folder in
  // both. Expansion is not persisted; a live filter opens everything anyway.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  const hasArchive = !!(onArchive || onUnarchive)
  const hasStaging = !!(onStage && onRelease)
  const folderMode = viewMode === 'folder'
  const query = search.trim().toLowerCase()

  // The shown sets in list order, each filtered.
  const sections = useMemo(() => {
    const all: { key: SetKey; label: string; files: T[] }[] = [
      { key: 'active', label: 'Active', files },
      { key: 'staged', label: 'Staged', files: stagedFiles },
      { key: 'archived', label: archivedLabel, files: archivedFiles }
    ]
    return all
      .filter((s) => shown.includes(s.key))
      .map((s) => ({
        ...s,
        total: s.files.length,
        files: query ? s.files.filter((f) => matches(f, query)) : s.files
      }))
  }, [files, stagedFiles, archivedFiles, archivedLabel, shown, query, matches])

  // The trees are built here rather than at render so that expanding one
  // folder does not re-group every file, and so the expand-all button can read
  // the folder set every shown set contributes.
  const trees = useMemo(
    () =>
      new Map(sections.map((s) => [s.key, folderMode ? buildFileTree(s.files) : null] as const)),
    [sections, folderMode]
  )

  const allFolders = useMemo(() => {
    const paths = new Set<string>()
    for (const tree of trees.values()) {
      if (!tree) continue
      for (const path of allFolderPaths(tree)) paths.add(path)
    }
    return paths
  }, [trees])

  // Measured against the folder set, not against a count: a folder that is
  // opened, filtered away, then restored leaves the two sets the same size and
  // different.
  const allExpanded = allFolders.size > 0 && [...allFolders].every((p) => expanded.has(p))
  const toggleExpandAll = (): void => setExpanded(allExpanded ? new Set() : new Set(allFolders))

  const toggleFolder = (path: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const toggleSet = (key: SetKey): void =>
    setCollapsedSets((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // ── Arrow-key navigation (HTOO-426) ─────────────────────────────────────────
  //
  // Arrow keys only have to move focus, and the row order is whatever is in the
  // DOM — set and folder headers included, which is what a tree should do.
  //
  // `[role="button"]` selects exactly the ListItemButtons: MUI renders them as
  // divs with that role. A real <button> in the header slot (the world map
  // editor's "Create Reference Set") carries no role attribute and is skipped,
  // which is right — it is an action, not a row.
  const listBodyRef = useRef<HTMLDivElement>(null)

  const handleListKeyDown = useCallback((e: React.KeyboardEvent): void => {
    const rows = Array.from(
      listBodyRef.current?.querySelectorAll<HTMLElement>('[role="button"]') ?? []
    )
    if (rows.length === 0) return
    const current = rows.indexOf(document.activeElement as HTMLElement)
    const next = nextCursorIndex(e.key, current, rows.length)
    if (next === null) return
    e.preventDefault()
    rows[next]?.focus()
  }, [])

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
  const shownTotal = sections.reduce((n, s) => n + s.total, 0)
  const shownMatches = sections.reduce((n, s) => n + s.files.length, 0)
  const nothingAtAll = shownTotal === 0 && !headerMatches?.('')
  const noMatches = shownMatches === 0 && !nothingAtAll && !headerMatches?.(query)

  // ── The item actions, from the open file ────────────────────────────────────
  const selected = selectedFile
  const archiveKind = selected?.archived ? 'unarchive' : 'archive'
  const archiveHandler = archiveKind === 'unarchive' ? onUnarchive : onArchive
  const archiveText = archiveKind === 'unarchive' ? unarchiveLabel : archiveLabel
  // Staging has no archive, as in Creidhne: Release, then Archive.
  const archiveReason =
    disabledActions.archive ??
    (selected?.staged ? `Release this ${entityLabel} before you archive it` : undefined)
  const archiveEnabled = !!selected && !!archiveHandler && !archiveReason
  const stageKind = selected?.staged ? 'release' : 'stage'
  const stageHandler = stageKind === 'release' ? onRelease : onStage
  const stageText = stageKind === 'release' ? 'Release' : 'Stage'
  const stageReason =
    disabledActions.stage ??
    (selected?.archived ? `Unarchive this ${entityLabel} before you stage it` : undefined)
  const stageEnabled = !!selected && !!stageHandler && !stageReason
  const copyEnabled = !!selected && !!onDuplicate && !disabledActions.copy
  const deleteEnabled = !!selected && !!onDelete && !disabledActions.delete
  const why = (action: string, enabled: boolean, reason?: string): string =>
    enabled
      ? `${action} "${selected?.rel}"`
      : !selected
        ? `Open a ${entityLabel} to ${action.toLowerCase()} it`
        : (reason ?? `${action} does not apply to this ${entityLabel}`)

  const toggles = [
    hasStaging && { key: 'staged' as const, label: 'Staged', count: stagedFiles.length },
    hasArchive && { key: 'archived' as const, label: archivedLabel, count: archivedFiles.length },
    { key: 'active' as const, label: 'Active', count: files.length }
  ].filter((t): t is { key: SetKey; label: string; count: number } => !!t)

  const newLabel = `New ${entityLabel.replace(/\b\w/g, (c) => c.toUpperCase())}`

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* ── The page toolbar ── */}
      <Box
        data-testid="page-toolbar"
        role="toolbar"
        aria-label={`${title} toolbar`}
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          flexShrink: 0,
          minHeight: 44,
          borderBottom: 1,
          borderColor: 'divider'
        }}
      >
        <Box
          sx={{
            width: FILE_LIST_WIDTH,
            flexShrink: 0,
            px: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRight: 1,
            borderColor: 'divider'
          }}
        >
          <Typography variant="h6" noWrap>
            {title}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, minWidth: 0 }}>
          <ToolbarButton title={newLabel} label={newLabel} onClick={onNew}>
            <AddIcon fontSize="small" />
          </ToolbarButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <ToolbarButton
            title={folderMode ? 'Grouping by folder' : 'Flat list'}
            label={folderMode ? 'Switch to flat list' : 'Group by folder'}
            onClick={() => setViewMode(folderMode ? 'flat' : 'folder')}
          >
            {folderMode ? <AccountTreeIcon fontSize="small" /> : <ViewListIcon fontSize="small" />}
          </ToolbarButton>
          {folderMode && allFolders.size > 0 && (
            // Disabled while filtering, not hidden: the filter already opens
            // every surviving folder, so the button would look broken. Say why.
            <ToolbarButton
              title={
                query
                  ? 'Filtering already shows every match'
                  : allExpanded
                    ? 'Collapse all folders'
                    : 'Expand all folders'
              }
              label={allExpanded ? 'Collapse all folders' : 'Expand all folders'}
              disabled={!!query}
              onClick={toggleExpandAll}
            >
              {allExpanded ? (
                <UnfoldLessIcon fontSize="small" />
              ) : (
                <UnfoldMoreIcon fontSize="small" />
              )}
            </ToolbarButton>
          )}
          {toggles.length > 1 && (
            <ToggleButtonGroup
              size="small"
              value={shown}
              // At least one set stays on: an empty list with no way to say why
              // is worse than a toggle that does not turn off.
              onChange={(_, next: SetKey[]) => {
                if (next.length) setShown(next)
              }}
              aria-label="Sets to show"
              sx={{ ml: 0.5 }}
            >
              {toggles.map((t) => (
                <ToggleButton
                  key={t.key}
                  value={t.key}
                  aria-label={`${t.label} (${t.count})`}
                  sx={{ py: 0.25, px: 1, textTransform: 'none', whiteSpace: 'nowrap' }}
                >
                  {t.label}
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ ml: 0.75, color: 'text.secondary' }}
                  >
                    {t.count}
                  </Typography>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {hasArchive && (
            <ToolbarButton
              title={why(archiveText, archiveEnabled, archiveReason)}
              label={archiveText}
              disabled={!archiveEnabled}
              onClick={() => selected && archiveHandler?.(selected)}
            >
              {archiveKind === 'unarchive' ? (
                <UnarchiveIcon fontSize="small" />
              ) : (
                <ArchiveIcon fontSize="small" />
              )}
            </ToolbarButton>
          )}
          {hasStaging && (
            <ToolbarButton
              title={why(stageText, stageEnabled, stageReason)}
              label={stageText}
              disabled={!stageEnabled}
              onClick={() => selected && stageHandler?.(selected)}
            >
              {stageKind === 'release' ? (
                <PublishIcon fontSize="small" />
              ) : (
                <PendingActionsIcon fontSize="small" />
              )}
            </ToolbarButton>
          )}
          {!!onDuplicate && (
            <ToolbarButton
              title={why('Duplicate', copyEnabled, disabledActions.copy)}
              label="Duplicate"
              disabled={!copyEnabled}
              onClick={() => selected && onDuplicate(selected)}
            >
              <ContentCopyIcon fontSize="small" />
            </ToolbarButton>
          )}
          {!!onDelete && (
            <ToolbarButton
              title={why('Delete', deleteEnabled, disabledActions.delete)}
              label="Delete"
              disabled={!deleteEnabled}
              onClick={() => setPendingDelete(selected)}
            >
              <DeleteIcon fontSize="small" />
            </ToolbarButton>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* ── The file list ── */}
        <Box
          data-testid="file-list"
          sx={{
            width: FILE_LIST_WIDTH,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <Box sx={{ p: 1 }}>
            <FilterField
              fullWidth
              placeholder="Filter..."
              value={search}
              onChange={setSearch}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown') return
                e.preventDefault()
                listBodyRef.current?.querySelector<HTMLElement>('[role="button"]')?.focus()
              }}
            />
          </Box>
          <Divider />
          <Box ref={listBodyRef} onKeyDown={handleListKeyDown} sx={{ flex: 1, overflow: 'auto' }}>
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
              sections.map((s) => {
                // A live filter opens every set, as it opens every folder.
                const open = !!query || !collapsedSets.has(s.key)
                return (
                  <React.Fragment key={s.key}>
                    <ListItem disablePadding>
                      <ListItemButton
                        data-testid={`list-section-${s.key}`}
                        aria-expanded={open}
                        onClick={() => toggleSet(s.key)}
                        sx={{
                          py: 0.25,
                          px: 1,
                          gap: 0.5,
                          bgcolor: 'action.hover',
                          borderBottom: 1,
                          borderColor: 'divider'
                        }}
                      >
                        {open ? (
                          <ExpandLessIcon fontSize="small" />
                        ) : (
                          <ExpandMoreIcon fontSize="small" />
                        )}
                        <Typography variant="overline" sx={{ lineHeight: 1.5, flex: 1 }}>
                          {s.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {s.files.length}
                        </Typography>
                      </ListItemButton>
                    </ListItem>
                    {open && renderList(s.files, trees.get(s.key) ?? null, s.key === 'archived')}
                  </React.Fragment>
                )
              })
            )}
          </Box>
        </Box>

        {/* ── The editor column, with the alerts area for its header ── */}
        <EditorAlertsProvider>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              p: 2,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {children}
          </Box>
        </EditorAlertsProvider>
      </Box>

      {/* Delete confirmation. The file goes to the OS trash, so this is a soft
          "are you sure" rather than a final warning. */}
      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <DialogTitle>Delete this {entityLabel}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            &quot;{pendingDelete?.rel}&quot; moves to your system trash. You can recover it from the
            Recycle Bin or Trash.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              const file = pendingDelete
              setPendingDelete(null)
              if (file) onDelete?.(file)
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
