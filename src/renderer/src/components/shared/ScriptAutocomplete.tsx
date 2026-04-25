/**
 * ScriptAutocomplete
 *
 * Autocomplete for Lua script names backed by the world index (scripts: string[]).
 * Scripts in the index are stored as relative paths without the .lua extension
 * (e.g. "Meena", "monsters/Goblin"). We strip the directory prefix for display
 * and matching so callers can just store the bare filename, matching how the
 * Hybrasyl XML references scripts.
 *
 * Shows an amber warning when the typed value is not in the index.
 */

import React from 'react'
import { Autocomplete, TextField } from '@mui/material'
import { useWorldIndex } from '../../hooks/useWorldIndex'

function stripPath(s: string): string {
  return s.replace(/.*[/\\]/, '')
}

interface ScriptAutocompleteProps {
  label: string
  value: string
  onChange: (value: string) => void
  helperText?: string
  fullWidth?: boolean
  size?: 'small' | 'medium'
}

export default function ScriptAutocomplete({
  label,
  value,
  onChange,
  helperText,
  fullWidth = true,
  size = 'small'
}: ScriptAutocompleteProps) {
  const { index } = useWorldIndex()
  const options = (index?.scripts ?? []).map(stripPath)
  const isUnknown = !!value && !options.includes(value)

  return (
    <Autocomplete
      freeSolo
      options={options}
      value={value}
      onInputChange={(_, val) => onChange(val)}
      size={size}
      fullWidth={fullWidth}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          helperText={helperText ?? (isUnknown && value ? 'Script not found in index' : undefined)}
          color={isUnknown && value ? 'warning' : 'primary'}
          focused={isUnknown && !!value ? true : undefined}
        />
      )}
    />
  )
}
