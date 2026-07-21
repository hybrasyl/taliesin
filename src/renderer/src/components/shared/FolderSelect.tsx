import React from 'react'
import { Autocomplete, TextField } from '@mui/material'
import { normalizeFolder } from '../../utils/fileTree'

interface Props {
  /** Folder path relative to the type directory; `''` is the type root. */
  value: string
  /** Folders already in use in this section — see `folderOptions`. */
  options: string[]
  onChange: (folder: string) => void
  /** Marks the field when the pick would relocate the file on save. */
  warn?: boolean
}

/**
 * Where a file gets saved, within its type directory.
 *
 * `freeSolo` because folders are not a data model — a subfolder exists only
 * because files are in it, so typing a new one is how you create one (the
 * main-process write mkdir -p's the parent). Input is normalized on the way
 * out: a typed `..` should read as an unavailable option here rather than as
 * a path-safety error dialog after the save.
 */
const FolderSelect: React.FC<Props> = ({ value, options, onChange, warn }) => (
  <Autocomplete
    freeSolo
    size="small"
    options={options}
    value={value}
    onChange={(_, v) => onChange(normalizeFolder(v ?? ''))}
    onInputChange={(_, v, reason) => {
      // Normalizing every keystroke would eat the separator the moment it is
      // typed, so only clean up on blur and on selection.
      if (reason === 'input') onChange(v)
      else if (reason === 'clear') onChange('')
    }}
    onBlur={() => onChange(normalizeFolder(value))}
    sx={{ flex: 1 }}
    renderInput={(params) => (
      <TextField
        {...params}
        label="Folder"
        placeholder="(root)"
        // MUI v9 hands renderInput a `slotProps` (not the v5-era InputProps /
        // inputProps), and it carries the classes Autocomplete styles itself
        // through. Replacing the object instead of merging into it drops
        // `.MuiAutocomplete-input` from the inner input, which then keeps the
        // default 8.5px vertical padding while the root still gets
        // Autocomplete's — leaving the field taller than the Filename one
        // beside it.
        slotProps={{
          ...params.slotProps,
          htmlInput: { ...params.slotProps?.htmlInput, spellCheck: false }
        }}
        sx={
          warn
            ? {
                '& .MuiOutlinedInput-root fieldset': { borderColor: 'warning.main' },
                '& .MuiInputLabel-root:not(.Mui-focused)': { color: 'warning.main' }
              }
            : undefined
        }
      />
    )}
  />
)

export default FolderSelect
