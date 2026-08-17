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

/** A file that names the map, and which world section it lives in. */
export interface Referrer {
  file: string
  count: number
  section: string
}

/** What a section is called in a sentence, and what one hit in it is called. */
const SECTION_LABELS: Record<string, { file: string; hit: string }> = {
  maps: { file: 'map', hit: 'warp' },
  nations: { file: 'nation', hit: 'reference' },
  serverconfigs: { file: 'server config', hit: 'reference' },
  worldmaps: { file: 'world map', hit: 'point' }
}

function labelFor(section: string): { file: string; hit: string } {
  return SECTION_LABELS[section] ?? { file: 'file', hit: 'reference' }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

interface Props {
  open: boolean
  oldName: string
  newName: string
  referrers: Referrer[]
  busy: boolean
  onUpdate: () => void
  onSkip: () => void
  onCancel: () => void
}

/**
 * Offer to repoint everything that names a map, when that map is being renamed.
 *
 * A map is referred to by name and the reference is resolved at use time, so
 * renaming it breaks every reference immediately — and the damage is in *other*
 * files, which is why it is easy to miss (HTOO-347).
 *
 * Not only warps. A nation's spawn points and territory, a server config's
 * death map and start maps, and a world map's travel points all name maps the
 * same way, so they are all listed here, grouped by what kind of file they are.
 * The counts have to be per kind, because "12 warps" was the wrong sentence the
 * moment a nation was in the list.
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

  // Grouped by section, in the order the sections were scanned, so the list
  // reads as "these maps, then this nation" rather than interleaved.
  const groups = referrers.reduce<Record<string, Referrer[]>>((acc, r) => {
    ;(acc[r.section] ??= []).push(r)
    return acc
  }, {})
  const sections = Object.keys(groups)

  /** "8 warps in 5 maps, and 2 references in 1 nation". */
  const summary = sections
    .map((section) => {
      const rows = groups[section]!
      const { file, hit } = labelFor(section)
      const hits = rows.reduce((sum, r) => sum + r.count, 0)
      return `${plural(hits, hit)} in ${plural(rows.length, file)}`
    })
    .join(', ')

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Update what points at this map?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1.5 }}>
          {summary} point at &ldquo;{oldName}&rdquo;. Each finds this map by name, so renaming it to
          &ldquo;{newName}&rdquo; stops all of them working.
        </DialogContentText>
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Only destinations are changed. Text that a player reads is left alone, such as a sign that
          mentions the old name, or the label on a world map point.
        </Alert>
        <List dense sx={{ maxHeight: 260, overflow: 'auto' }}>
          {sections.map((section) => (
            <React.Fragment key={section}>
              <ListItem disableGutters sx={{ pt: 1, pb: 0 }}>
                <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                  {labelFor(section).file}s
                </Typography>
              </ListItem>
              {groups[section]!.map((r) => (
                <ListItem key={`${section}/${r.file}`} disableGutters sx={{ pl: 1.5, py: 0 }}>
                  <ListItemText
                    primary={r.file}
                    secondary={plural(r.count, labelFor(section).hit)}
                    slotProps={{
                      primary: { variant: 'body2', sx: { fontFamily: 'monospace' } },
                      secondary: { variant: 'caption' }
                    }}
                  />
                </ListItem>
              ))}
            </React.Fragment>
          ))}
        </List>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Skip saves this map and leaves all of those broken. Cancel saves nothing.
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
