import React, { useCallback, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText
} from '@mui/material'

/** One answer the dialog offers, as well as Cancel. */
export interface Choice {
  value: string
  label: string
  variant?: 'text' | 'outlined' | 'contained'
}

/** What `ask` shows. With no `choices`, the dialog has only an OK button. */
export interface ChoiceRequest {
  title: string
  message: string
  /** Shown as a list under the message: the files the question is about. */
  items?: string[]
  choices?: Choice[]
}

/**
 * A question the page asks with `await`, as Creidhne's `confirm` (HTOO-453).
 *
 *   const { ask, dialog } = useChoiceDialog()
 *   const choice = await ask({ title, message, items, choices })
 *
 * `ask` resolves with the value of the button the user clicks, or `null` for
 * Cancel, OK, Escape or a click outside. The page renders `dialog` once. A
 * second `ask` while one is open answers the first with `null`.
 */
export function useChoiceDialog(): {
  ask: (request: ChoiceRequest) => Promise<string | null>
  dialog: React.ReactElement
} {
  const [request, setRequest] = useState<ChoiceRequest | null>(null)
  const resolveRef = useRef<((value: string | null) => void) | null>(null)

  const answer = useCallback((value: string | null) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setRequest(null)
    resolve?.(value)
  }, [])

  const ask = useCallback(
    (next: ChoiceRequest) =>
      new Promise<string | null>((resolve) => {
        resolveRef.current?.(null)
        resolveRef.current = resolve
        setRequest(next)
      }),
    []
  )

  const choices = request?.choices ?? []
  const dialog = (
    <Dialog open={!!request} onClose={() => answer(null)} maxWidth="sm" fullWidth>
      <DialogTitle>{request?.title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{request?.message}</DialogContentText>
        {!!request?.items?.length && (
          <List dense sx={{ maxHeight: 260, overflow: 'auto', mt: 1 }}>
            {request.items.map((item) => (
              <ListItem key={item} disableGutters sx={{ py: 0 }}>
                <ListItemText
                  primary={item}
                  slotProps={{ primary: { variant: 'body2', sx: { fontFamily: 'monospace' } } }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => answer(null)}>{choices.length ? 'Cancel' : 'OK'}</Button>
        {choices.map((c) => (
          <Button key={c.value} variant={c.variant ?? 'text'} onClick={() => answer(c.value)}>
            {c.label}
          </Button>
        ))}
      </DialogActions>
    </Dialog>
  )
  return { ask, dialog }
}
