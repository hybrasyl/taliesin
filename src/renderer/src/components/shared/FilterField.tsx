import React, { useCallback, useRef } from 'react'
import { IconButton, InputAdornment, TextField, Tooltip } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'

interface Props {
  value: string
  onChange: (value: string) => void
  /** Kept per call site: the existing wording is more specific than a default. */
  placeholder?: string
  fullWidth?: boolean
  autoFocus?: boolean
  sx?: SxProps<Theme>
  /**
   * Passed through to the field. `FilterField` consumes Escape while there is
   * text to clear, and delegates every other key.
   */
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>
}

/**
 * The one filter/search box (HTOO-422).
 *
 * Ten surfaces carry a filter field and not one could be cleared without
 * selecting the text and deleting it. Rather than paste the same adornment ten
 * times, they all render this. Creidhne's `EditorFileListPanel` sets the
 * placement and icons, so the two apps read the same.
 *
 * Two rules are worth stating:
 *
 * - The clear button exists **only while there is something to clear**, so the
 *   field never carries a permanent dead control.
 * - It is not a tab stop. It appears and disappears as the user types, and a
 *   tab stop that comes and goes moves the tab order under the user's hands.
 *   Escape is the keyboard path to the same action, so nothing is lost.
 */
export const FilterField: React.FC<Props> = ({
  value,
  onChange,
  placeholder = 'Filter…',
  fullWidth,
  autoFocus,
  sx,
  onKeyDown
}) => {
  const inputRef = useRef<HTMLInputElement>(null)

  const clear = useCallback(() => {
    onChange('')
    // The button is inside the field, so clicking it takes focus off the input.
    // Give it back: the user cleared the filter to type a new one.
    inputRef.current?.focus()
  }, [onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Escape clears a field that has text, and stops there. Without
      // stopPropagation the same keystroke also closes the dialog the field
      // sits in (MusicPickerDialog): the first Escape clears, a second closes.
      // An empty field consumes nothing, so Escape still closes immediately
      // when there is no filter to lose.
      if (e.key === 'Escape' && value !== '') {
        e.stopPropagation()
        clear()
        return
      }
      onKeyDown?.(e)
    },
    [value, clear, onKeyDown]
  )

  return (
    <TextField
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      fullWidth={fullWidth}
      autoFocus={autoFocus}
      inputRef={inputRef}
      sx={sx}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <Tooltip title="Clear filter">
                <IconButton
                  size="small"
                  edge="end"
                  tabIndex={-1}
                  aria-label="Clear filter"
                  onClick={clear}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ) : null
        }
      }}
    />
  )
}

export default FilterField
