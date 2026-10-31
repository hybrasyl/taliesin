import React from 'react'
import HouseEditorHeader from '../editorShell/EditorHeader'
import FolderSelect from './FolderSelect'

interface Props {
  title: string
  fileName: string
  initialFileName?: string | null
  computedFileName?: string
  isExisting?: boolean
  onFileNameChange: (value: string) => void
  /** Save destination within the type directory. Omit the trio to hide the
   *  picker entirely (editors that have no folder notion). */
  folder?: string
  folderOptions?: string[]
  /** The folder the file is in now — `''` for a new file at the root. */
  initialFolder?: string
  onFolderChange?: (value: string) => void
  onRegenerate: () => void
  onSave: () => void
  /** Move the file to the typed name and folder, and write nothing else. Omit
   *  to hide the Rename button. */
  onRenameFile?: () => void
}

/**
 * Taliesin's editor header: the house header (`editorShell/EditorHeader.tsx`,
 * HTOO-637) with Taliesin's folder picker.
 *
 * A Taliesin save moves the file: one file the whole time, and nothing is
 * archived (HTOO-379). The house header's default save sentence says that, so
 * this passes none of its own.
 */
const EditorHeader: React.FC<Props> = ({ folderOptions, onFolderChange, folder, ...rest }) => (
  <HouseEditorHeader
    {...rest}
    folder={folder}
    renderFolderPicker={
      onFolderChange
        ? (willMove) => (
            <FolderSelect
              value={folder ?? ''}
              options={folderOptions ?? []}
              onChange={onFolderChange}
              warn={willMove}
            />
          )
        : undefined
    }
  />
)

export default EditorHeader
