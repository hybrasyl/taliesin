// house module: editor-shell v1 — change it in the template, then port
import React, { useCallback, useImperativeHandle, useState } from 'react'
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
  ListItemIcon,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArchiveIcon from '@mui/icons-material/Archive'
import UnarchiveIcon from '@mui/icons-material/Unarchive'
import PendingActionsIcon from '@mui/icons-material/PendingActions'
import PublishIcon from '@mui/icons-material/Publish'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import ViewListIcon from '@mui/icons-material/ViewList'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess'
import { EditorAlertsProvider } from './EditorAlerts'
import { selectionActions, type ShellFile } from './selectionActions'

/** The default width of the file list, and of the toolbar cell above it. */
export const FILE_LIST_WIDTH = 240

/** A set toggle in the toolbar, in toolbar order. */
export interface ShellSet {
  key: string
  label: string
  count: number
}

/** A page-specific toolbar button, before New. */
export interface ShellExtraAction {
  icon: React.ReactNode
  tooltip: string
  onClick: () => void
  disabled?: boolean
}

/** An entry of the New menu, when New offers more than one thing. */
export interface ShellNewMenuItem {
  label: string
  onClick: () => void
  icon?: React.ReactNode
}

/** An item action the page has that does not apply to the selection. The
 *  string is the tooltip that says why. */
export interface DisabledActions {
  archive?: string
  stage?: string
  copy?: string
  delete?: string
}

/** The shell's handle, through `ref`. `openContextMenu` opens the context menu
 *  at the pointer. The list sets the selection first, so the menu acts on the
 *  row under it. The function is stable, so a memoized row can hold it. */
export interface EditorPageShellHandle {
  openContextMenu: (e: React.MouseEvent) => void
}

export interface EditorPageShellProps<T extends ShellFile> {
  /** The page name: "Maps", "Statuses". */
  title: string
  /** The lowercase singular: "map", "status". */
  entityLabel: string
  /** The width of the list column. */
  width?: number
  /** The tooltip and name of New. Defaults to "New <Entity>". */
  newLabel?: string
  onNew: () => void
  /** Make New a menu of these, in place of `onNew`. */
  newMenuItems?: ShellNewMenuItem[]
  extraActions?: ShellExtraAction[]
  folderMode: boolean
  onFolderModeChange: (folderMode: boolean) => void
  /** The expand-all button. Give it in folder mode when the list has folders. */
  expandAll?: { allExpanded: boolean; filtering: boolean; onToggle: () => void } | null
  /** The set toggles, in toolbar order. They show when there are two or more. */
  sets: ShellSet[]
  shownSets: string[]
  /** Never called with an empty list: one set stays on. */
  onShownSetsChange: (next: string[]) => void
  /** The files the item actions act on. */
  selection: readonly T[]
  /** How a file is named in a tooltip and in the delete dialog. */
  describeFile: (file: T) => string
  archiveLabel?: string
  unarchiveLabel?: string
  onArchive?: (files: T[]) => unknown
  onUnarchive?: (files: T[]) => unknown
  /** Give both, or neither: Stage is Release for a staged selection. */
  onStage?: (files: T[]) => unknown
  onRelease?: (files: T[]) => unknown
  onDuplicate?: (file: T) => unknown
  /** Called after the user confirms. */
  onDelete?: (files: T[]) => unknown
  disabledActions?: DisabledActions
  /** Called after an item action is done, for example to clear the selection. */
  onActionDone?: () => void
  /** The list column under the toolbar: the filter and the list. */
  list: React.ReactNode
  /** The editor column. */
  children: React.ReactNode
  ref?: React.Ref<EditorPageShellHandle>
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
}): React.JSX.Element {
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

const capitalize = (s: string): string => s.replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * The frame of a world XML editor page: part of the editor shell house module
 * (HTOO-637, from Creidhne's HTOO-628 and Taliesin's HTOO-633). A toolbar
 * across the page, the list column on the left, and the editor column on the
 * right.
 *
 *   (Page name) | (New) | (Flat) (Staged) (Archived) (Active) | (Archive) (Stage) (Copy) (Delete)
 *
 * The shell owns the toolbar, the context menu and the delete confirmation,
 * because they act on one selection. It puts the alerts provider
 * (`EditorAlerts.tsx`) around the editor column, so a notice anywhere in the
 * column shows under the editor header.
 *
 * The list is the app's, through `list`: its rows, its filter, its tree and its
 * selection rules. A row opens the context menu through the `ref` handle. The shell reads only the selection the app gives it. The
 * set toggles are controlled the same way: the app has the files, so it counts
 * them and filters them.
 *
 * Each item action is enabled only when it applies to every selected file
 * (`selectionActions.ts`). Archive is Unarchive for archived files, and Stage
 * is Release for staged files. A disabled action says why in its tooltip.
 */
export default function EditorPageShell<T extends ShellFile>({
  title,
  entityLabel,
  width = FILE_LIST_WIDTH,
  newLabel,
  onNew,
  newMenuItems,
  extraActions,
  folderMode,
  onFolderModeChange,
  expandAll,
  sets,
  shownSets,
  onShownSetsChange,
  selection,
  describeFile,
  archiveLabel = 'Archive',
  unarchiveLabel = 'Unarchive',
  onArchive,
  onUnarchive,
  onStage,
  onRelease,
  onDuplicate,
  onDelete,
  disabledActions = {},
  onActionDone,
  list,
  children,
  ref
}: EditorPageShellProps<T>): React.JSX.Element {
  const [newAnchor, setNewAnchor] = useState<HTMLElement | null>(null)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<T[] | null>(null)

  const openContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenuAt({ x: e.clientX, y: e.clientY })
  }, [])
  useImperativeHandle(ref, () => ({ openContextMenu }), [openContextMenu])

  const hasArchive = !!(onArchive || onUnarchive)
  const hasStaging = !!(onStage && onRelease)
  const count = selection.length
  const actions = selectionActions(selection, entityLabel)

  // Each action: its handler, whether it is enabled, and its tooltip.
  const archiveText = actions.archive.kind === 'unarchive' ? unarchiveLabel : archiveLabel
  const archiveHandler = actions.archive.kind === 'unarchive' ? onUnarchive : onArchive
  const moveHandler = actions.move.kind === 'release' ? onRelease : onStage
  const reasonFor = {
    archive: disabledActions.archive ?? actions.archive.reason,
    move: disabledActions.stage ?? actions.move.reason,
    copy: disabledActions.copy ?? actions.copy.reason,
    delete: disabledActions.delete ?? actions.delete.reason
  }
  const enabled = {
    archive: actions.archive.enabled && !!archiveHandler && !disabledActions.archive,
    move: actions.move.enabled && !!moveHandler && !disabledActions.stage,
    copy: actions.copy.enabled && !!onDuplicate && !disabledActions.copy,
    delete: actions.delete.enabled && !!onDelete && !disabledActions.delete
  }
  const what = count === 1 ? `"${describeFile(selection[0] as T)}"` : `${count} files`
  const why = (label: string, on: boolean, reason?: string): string =>
    on
      ? `${label} ${what}`
      : count === 0
        ? `Select a ${entityLabel} to ${label.toLowerCase()} it`
        : (reason ?? `${label} does not apply to this ${entityLabel}`)

  const run = async (kind: 'archive' | 'move' | 'copy' | 'delete'): Promise<void> => {
    setMenuAt(null)
    const files = [...selection]
    if (kind === 'delete') {
      if (onDelete && files.length) setPendingDelete(files)
      return
    }
    if (kind === 'copy') {
      if (files.length === 1) await onDuplicate?.(files[0] as T)
    } else if (kind === 'archive') {
      await archiveHandler?.(files)
    } else {
      await moveHandler?.(files)
    }
    onActionDone?.()
  }

  const confirmDelete = async (): Promise<void> => {
    const files = pendingDelete
    setPendingDelete(null)
    if (!files?.length) return
    await onDelete?.(files)
    onActionDone?.()
  }

  const archiveIcon =
    actions.archive.kind === 'unarchive' ? (
      <UnarchiveIcon fontSize="small" />
    ) : (
      <ArchiveIcon fontSize="small" />
    )
  const moveIcon =
    actions.move.kind === 'release' ? (
      <PublishIcon fontSize="small" />
    ) : (
      <PendingActionsIcon fontSize="small" />
    )
  const suffix = count > 1 ? ` (${count})` : ''
  const newText = newLabel ?? `New ${capitalize(entityLabel)}`

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
            width,
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
          {(extraActions ?? []).map((action, i) => (
            <ToolbarButton
              key={i}
              title={action.tooltip}
              label={action.tooltip}
              disabled={!!action.disabled}
              onClick={action.onClick}
            >
              {action.icon}
            </ToolbarButton>
          ))}
          <ToolbarButton
            title={newMenuItems?.length ? 'Create…' : newText}
            label={newText}
            onClick={(e) => (newMenuItems?.length ? setNewAnchor(e.currentTarget) : onNew())}
          >
            <AddIcon fontSize="small" />
          </ToolbarButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <ToolbarButton
            title={folderMode ? 'Grouping by folder' : 'Flat list'}
            label={folderMode ? 'Switch to flat list' : 'Group by folder'}
            onClick={() => onFolderModeChange(!folderMode)}
          >
            {folderMode ? <AccountTreeIcon fontSize="small" /> : <ViewListIcon fontSize="small" />}
          </ToolbarButton>
          {expandAll && (
            // Disabled while filtering, not hidden: a filter already opens every
            // folder that has a match, so the button would do nothing. Say why.
            <ToolbarButton
              title={
                expandAll.filtering
                  ? 'Filtering already shows every match'
                  : expandAll.allExpanded
                    ? 'Collapse all folders'
                    : 'Expand all folders'
              }
              label={expandAll.allExpanded ? 'Collapse all folders' : 'Expand all folders'}
              disabled={expandAll.filtering}
              onClick={expandAll.onToggle}
            >
              {expandAll.allExpanded ? (
                <UnfoldLessIcon fontSize="small" />
              ) : (
                <UnfoldMoreIcon fontSize="small" />
              )}
            </ToolbarButton>
          )}
          {sets.length > 1 && (
            <ToggleButtonGroup
              size="small"
              value={shownSets}
              // One set stays on: an empty list with no way to say why is worse
              // than a toggle that does not turn off.
              onChange={(_, next: string[]) => {
                if (next.length) onShownSetsChange(next)
              }}
              aria-label="Sets to show"
              sx={{ ml: 0.5 }}
            >
              {sets.map((s) => (
                <ToggleButton
                  key={s.key}
                  value={s.key}
                  aria-label={`${s.label} (${s.count})`}
                  sx={{ py: 0.25, px: 1, textTransform: 'none', whiteSpace: 'nowrap' }}
                >
                  {s.label}
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ ml: 0.75, color: 'text.secondary' }}
                  >
                    {s.count}
                  </Typography>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {hasArchive && (
            <ToolbarButton
              title={why(archiveText, enabled.archive, reasonFor.archive)}
              label={archiveText}
              disabled={!enabled.archive}
              onClick={() => void run('archive')}
            >
              {archiveIcon}
            </ToolbarButton>
          )}
          {hasStaging && (
            <ToolbarButton
              title={why(actions.move.label, enabled.move, reasonFor.move)}
              label={actions.move.label}
              disabled={!enabled.move}
              onClick={() => void run('move')}
            >
              {moveIcon}
            </ToolbarButton>
          )}
          {!!onDuplicate && (
            <ToolbarButton
              title={why('Duplicate', enabled.copy, reasonFor.copy)}
              label="Duplicate"
              disabled={!enabled.copy}
              onClick={() => void run('copy')}
            >
              <ContentCopyIcon fontSize="small" />
            </ToolbarButton>
          )}
          {!!onDelete && (
            <ToolbarButton
              title={why('Delete', enabled.delete, reasonFor.delete)}
              label="Delete"
              disabled={!enabled.delete}
              onClick={() => void run('delete')}
            >
              <DeleteIcon fontSize="small" />
            </ToolbarButton>
          )}
        </Box>
      </Box>

      <Menu
        open={!!newAnchor}
        anchorEl={newAnchor}
        onClose={() => setNewAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {(newMenuItems ?? []).map((item, i) => (
          <MenuItem
            key={i}
            onClick={() => {
              setNewAnchor(null)
              item.onClick()
            }}
          >
            {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
            {item.label}
          </MenuItem>
        ))}
      </Menu>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* ── The list column ── */}
        <Box
          data-testid="file-list"
          sx={{
            width,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {list}
        </Box>

        {/* ── The editor column, with the alerts area for its header ── */}
        <EditorAlertsProvider>{children}</EditorAlertsProvider>
      </Box>

      {/* The context menu has the toolbar's item actions. */}
      <Menu
        open={!!menuAt}
        onClose={() => setMenuAt(null)}
        anchorReference="anchorPosition"
        anchorPosition={menuAt ? { top: menuAt.y, left: menuAt.x } : undefined}
      >
        {hasArchive && (
          <MenuItem disabled={!enabled.archive} onClick={() => void run('archive')}>
            <ListItemIcon>{archiveIcon}</ListItemIcon>
            {archiveText}
            {suffix}
          </MenuItem>
        )}
        {hasStaging && (
          <MenuItem disabled={!enabled.move} onClick={() => void run('move')}>
            <ListItemIcon>{moveIcon}</ListItemIcon>
            {actions.move.label}
            {suffix}
          </MenuItem>
        )}
        {!!onDuplicate && (
          <MenuItem disabled={!enabled.copy} onClick={() => void run('copy')}>
            <ListItemIcon>
              <ContentCopyIcon fontSize="small" />
            </ListItemIcon>
            Duplicate
          </MenuItem>
        )}
        {!!onDelete && (
          <MenuItem disabled={!enabled.delete} onClick={() => void run('delete')}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            Delete{suffix}
          </MenuItem>
        )}
      </Menu>

      {/* Delete moves the files to the OS trash, so this is a soft "are you
          sure", not a final warning. */}
      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <DialogTitle>
          {pendingDelete?.length === 1
            ? `Delete this ${entityLabel}?`
            : `Delete ${pendingDelete?.length ?? 0} files?`}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingDelete?.length === 1
              ? `"${describeFile(pendingDelete[0] as T)}" moves to your system trash. You can recover it from the Recycle Bin or Trash.`
              : 'These files move to your system trash. You can recover them from the Recycle Bin or Trash.'}
          </DialogContentText>
          {pendingDelete && pendingDelete.length > 1 && (
            <Box
              sx={{
                mt: 1,
                maxHeight: 200,
                overflow: 'auto',
                bgcolor: 'action.hover',
                borderRadius: 1,
                px: 1.5,
                py: 1
              }}
            >
              {pendingDelete.slice(0, 20).map((f) => (
                <Typography key={f.path} variant="body2" sx={{ fontFamily: 'monospace' }} noWrap>
                  {describeFile(f)}
                </Typography>
              ))}
              {pendingDelete.length > 20 && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  and {pendingDelete.length - 20} more
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
