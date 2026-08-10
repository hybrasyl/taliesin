import React from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Typography
} from '@mui/material'

interface Props {
  open: boolean
  oldName: string
  newName: string
  referrers: { file: string; count: number }[]
  busy: boolean
  onUpdate: () => void
  onSkip: () => void
  onCancel: () => void
}

/**
 * Offer to repoint the warps that name a map, when that map is being renamed.
 *
 * A warp stores its destination as a name string and resolves it at traverse
 * time, so renaming a map breaks every inbound warp immediately — and the
 * damage is in *other* files, which is why it is easy to miss (HTOO-347).
 *
 * The list is shown before anything is written, because a rewrite across
 * dozens of files cannot be made atomic and the user should know its size
 * before agreeing to it. What actually changed is reported afterwards.
 *
 * Skip and Cancel are different answers, and the wording has to keep them
 * apart: Skip saves the map and leaves the warps broken, Cancel saves nothing.
 */
const RenameReferrersDialog: React.FC<Props> = ({
  open,
  oldName,
  newName,
  referrers,
  busy,
  onUpdate,
  onSkip,
  onCancel
}) => {
  const total = referrers.reduce((sum, r) => sum + r.count, 0)

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Update warps pointing at this map?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1.5 }}>
          {total} {total === 1 ? 'warp' : 'warps'} in {referrers.length}{' '}
          {referrers.length === 1 ? 'map' : 'maps'} point at &ldquo;{oldName}&rdquo;. A warp finds
          its destination by name, so renaming this map to &ldquo;{newName}&rdquo; stops all of them
          working.
        </DialogContentText>
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Only warp destinations are changed. Sign text that happens to mention the old name is left
          alone.
        </Alert>
        <List dense sx={{ maxHeight: 260, overflow: 'auto' }}>
          {referrers.map((r) => (
            <ListItem key={r.file} disableGutters>
              <ListItemText
                primary={r.file}
                secondary={`${r.count} ${r.count === 1 ? 'warp' : 'warps'}`}
                slotProps={{
                  primary: { variant: 'body2', sx: { fontFamily: 'monospace' } },
                  secondary: { variant: 'caption' }
                }}
              />
            </ListItem>
          ))}
        </List>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Skip saves this map and leaves those warps broken. Cancel saves nothing.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onSkip} disabled={busy} color="warning">
          Skip
        </Button>
        <Button onClick={onUpdate} disabled={busy} variant="contained">
          {busy ? 'Updating…' : `Update ${total}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default RenameReferrersDialog
