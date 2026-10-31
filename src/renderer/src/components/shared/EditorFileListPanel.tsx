import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  Box,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography
} from '@mui/material'
import { FilterField } from './FilterField'
import FolderIcon from '@mui/icons-material/Folder'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import EditorPageShell, {
  FILE_LIST_WIDTH,
  type DisabledActions
} from '../editorShell/EditorPageShell'
import { useSettingsStore } from '../../store/settingsStore'
import { nextCursorIndex } from '../../utils/listKeyboard'
import {
  allFolderPaths,
  buildFileTree,
  flattenTree,
  type FolderNode,
  type TreeFile
} from '../../utils/fileTree'

export { FILE_LIST_WIDTH }
export type { DisabledActions }

const INDENT_STEP = 1.5

/** A row the panel can act on. `path` is the selection's identity. */
export interface PanelFile extends TreeFile {
  path: string
  archived?: boolean
  /** In `<world>/.staging/<type>/` (HTOO-634). */
  staged?: boolean
}

type SetKey = 'active' | 'staged' | 'archived'

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

/** Act on the first file of the shell's selection: Taliesin selects one. */
function first<T>(handler: (file: T) => void): (files: T[]) => void {
  return (files) => {
    if (files[0]) handler(files[0])
  }
}

/**
 * Taliesin's world XML editor page: the house editor shell
 * (`editorShell/EditorPageShell.tsx`, HTOO-637) with Taliesin's list.
 *
 * The shell owns the toolbar, the delete confirmation and the alerts provider.
 * This file owns the list: the filter, the set headers, the folder tree and
 * the arrow keys.
 *
 * The selection is the open file, one at a time: Taliesin's editors do not take
 * Creidhne's multi-select. The shell's actions take a list, so this passes the
 * open file as a list of one.
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
  archiveLabel,
  unarchiveLabel,
  onArchive,
  onUnarchive,
  onDuplicate,
  onDelete,
  disabledActions,
  stagedFiles = [],
  onStage,
  onRelease,
  children
}: EditorFileListPanelProps<T>): React.ReactElement {
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState<SetKey[]>(['active'])
  const [collapsedSets, setCollapsedSets] = useState<ReadonlySet<SetKey>>(() => new Set())
  const viewMode = useSettingsStore((s) => s.fileListViewMode)
  const setViewMode = useSettingsStore((s) => s.setFileListViewMode)
  // Folders start closed and `expanded` records the exceptions — the same rule
  // creidhne's EditorFileListPanel uses, so the two trees behave alike. One Set
  // covers every set: a folder is the same folder in each. Expansion is not
  // persisted; a live filter opens everything anyway.
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

  // The set toggles, in toolbar order.
  const sets = [
    hasStaging && { key: 'staged', label: 'Staged', count: stagedFiles.length },
    hasArchive && { key: 'archived', label: archivedLabel, count: archivedFiles.length },
    { key: 'active', label: 'Active', count: files.length }
  ].filter((s): s is { key: SetKey; label: string; count: number } => !!s)

  return (
    <EditorPageShell<T>
      title={title}
      entityLabel={entityLabel}
      onNew={onNew}
      folderMode={folderMode}
      onFolderModeChange={(folder) => setViewMode(folder ? 'folder' : 'flat')}
      expandAll={
        folderMode && allFolders.size > 0
          ? { allExpanded, filtering: !!query, onToggle: toggleExpandAll }
          : null
      }
      sets={sets}
      shownSets={shown}
      onShownSetsChange={(next) => setShown(next as SetKey[])}
      selection={selectedFile ? [selectedFile] : []}
      describeFile={(f) => f.rel}
      archiveLabel={archiveLabel}
      unarchiveLabel={unarchiveLabel}
      onArchive={onArchive && first(onArchive)}
      onUnarchive={onUnarchive && first(onUnarchive)}
      onStage={onStage && first(onStage)}
      onRelease={onRelease && first(onRelease)}
      onDuplicate={onDuplicate}
      onDelete={onDelete && first(onDelete)}
      disabledActions={disabledActions}
      list={
        <>
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
        </>
      }
    >
      {/* The editor column's padding is Taliesin's: the shell adds none. */}
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
    </EditorPageShell>
  )
}
