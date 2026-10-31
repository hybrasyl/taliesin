// house module: editor-shell v1 — change it in the template, then port
/**
 * The page toolbar's item actions for a selection: part of the editor shell
 * house module (HTOO-637, from Creidhne's HTOO-628 `selectionActions`).
 *
 * Each action is enabled only when it applies to every selected file. Two of
 * them change with the selection: Archive is Unarchive for archived files, and
 * Stage is Release for staged files. Staging has no archive, so Archive does
 * not apply to a staged file, and an archived file cannot be staged. A
 * disabled action has the reason, which the toolbar shows as its tooltip.
 */

/** A file the shell can act on. `path` is its identity. */
export interface ShellFile {
  path: string
  archived?: boolean
  staged?: boolean
}

/** Which set a file is in. */
export type FileSet = 'active' | 'archived' | 'staged'

export function fileSet(file: ShellFile): FileSet {
  return file.staged ? 'staged' : file.archived ? 'archived' : 'active'
}

export interface ActionState<K extends string = string> {
  kind: K
  label: string
  enabled: boolean
  /** Why the action is disabled for a selection that is not empty. */
  reason?: string
}

export interface SelectionActions {
  archive: ActionState<'archive' | 'unarchive'>
  move: ActionState<'stage' | 'release'>
  copy: ActionState<'duplicate'>
  delete: ActionState<'delete'>
}

/**
 * The actions for `selected`. `entityLabel` is the singular noun the reasons
 * use, such as "map" or "status".
 */
export function selectionActions(
  selected: readonly ShellFile[],
  entityLabel: string
): SelectionActions {
  const count = selected.length
  const sets = new Set(selected.map(fileSet))
  const only = sets.size === 1 ? [...sets][0] : null
  const these = count === 1 ? `this ${entityLabel}` : 'these files'
  const it = count === 1 ? 'it' : 'them'
  const mixed = (label: string): string => `${label} does not apply to a mix of sets`

  const archive: SelectionActions['archive'] =
    only === 'archived'
      ? { kind: 'unarchive', label: 'Unarchive', enabled: true }
      : {
          kind: 'archive',
          label: 'Archive',
          enabled: only === 'active',
          reason:
            only === 'staged'
              ? `Release ${these} before you archive ${it}`
              : count > 0 && !only
                ? mixed('Archive')
                : undefined
        }
  const move: SelectionActions['move'] =
    only === 'staged'
      ? { kind: 'release', label: 'Release', enabled: true }
      : {
          kind: 'stage',
          label: 'Stage',
          enabled: only === 'active',
          reason:
            only === 'archived'
              ? `Unarchive ${these} before you stage ${it}`
              : count > 0 && !only
                ? mixed('Stage')
                : undefined
        }
  return {
    archive,
    move,
    copy: {
      kind: 'duplicate',
      label: 'Duplicate',
      enabled: count === 1,
      reason: count > 1 ? 'Duplicate takes one file' : undefined
    },
    delete: { kind: 'delete', label: 'Delete', enabled: count > 0 }
  }
}
