import React from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import {
  TOWN_SUBZONES,
  FIRST_GENERAL_SLOT,
  decodeTownMapId,
  type TownMapId
} from '../../data/townSubzones'

interface Props {
  open: boolean
  /** The map currently open, so the sheet can say what its own id means. */
  mapId: number
  onClose: () => void
}

/** One line describing what the open map's id decodes to. */
function CurrentMap({
  id,
  decoded
}: {
  id: number
  decoded: TownMapId | null
}): React.ReactElement {
  if (!decoded) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        Map {id} is outside the town range (30000–39999), so it has no subzone.
      </Alert>
    )
  }
  const role = decoded.general
    ? 'General town — no assigned role'
    : (decoded.subzone?.role ?? 'Unassigned slot')
  return (
    <Alert severity="success" sx={{ mb: 2 }}>
      Map {id} is town {String(decoded.town).padStart(2, '0')}, slot{' '}
      {String(decoded.slot).padStart(2, '0')} — <strong>{role}</strong>
    </Alert>
  )
}

/**
 * The town subzone registry, as a reference sheet.
 *
 * A town map's id encodes what the map is, and that is knowledge builders have
 * been carrying in their heads. Reachable from the `?` beside Properties
 * (HTOO-356).
 */
const SubzoneReferenceDialog: React.FC<Props> = ({ open, mapId, onClose }) => {
  const decoded = decodeTownMapId(mapId)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Town Subzone Reference</DialogTitle>
      <DialogContent>
        <CurrentMap id={mapId} decoded={decoded} />

        <Typography variant="body2" sx={{ mb: 1 }}>
          A town map&rsquo;s id is <code>30000 + town × 100 + subzone</code>. Map 30909 is town 09,
          subzone 09 — the tavern.
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
          The slot is a <strong>role</strong>, not a name: slot 14 is the wizard trainer, and towns
          call it &ldquo;Dark Wizard&rdquo; or &ldquo;Wizard Trainer&rdquo; as they please. Note the
          binary is <code>lod</code>-prefixed and the XML is <code>hyb</code>-prefixed for ids at or
          above 30000 — one map is <code>lod30202.map</code> and{' '}
          <code>hyb30202 - Abel Armory.xml</code>.
        </Typography>

        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 60 }}>Slot</TableCell>
              <TableCell>Subzone</TableCell>
              <TableCell>Sign</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {TOWN_SUBZONES.map((s) => {
              const isCurrent = decoded?.slot === s.slot
              return (
                <TableRow key={s.slot} selected={isCurrent}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>
                    {String(s.slot).padStart(2, '0')}
                  </TableCell>
                  <TableCell sx={{ fontWeight: isCurrent ? 700 : 400 }}>{s.role}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{s.sign ?? '—'}</TableCell>
                </TableRow>
              )
            })}
            <TableRow selected={decoded?.general}>
              <TableCell sx={{ fontFamily: 'monospace' }}>{FIRST_GENERAL_SLOT}+</TableCell>
              <TableCell sx={{ fontWeight: decoded?.general ? 700 : 400 }}>
                General town — no assigned role
              </TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>—</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Towns deviate where it suits them: coastal towns use slot 01 for their waterfront rather
            than a market threshold, and the class enclaves at 21–24 are largely unused.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default SubzoneReferenceDialog
