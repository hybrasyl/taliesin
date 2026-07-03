import React, { useState } from 'react'
import {
  Box,
  Typography,
  Chip,
  Tooltip,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemButton,
  ListItemText
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'

/**
 * A row in an {@link ItemsGroup}. `onEdit` and `isOrphan` are optional so the
 * same component serves both the map editor (every row editable, no orphans)
 * and the world map editor (derived rows may hide edit; orphans flagged).
 */
export interface ItemRow {
  key: number
  label: string
  selected: boolean
  isOrphan?: boolean
  onSelect: () => void
  onEdit?: () => void
  onRemove: () => void
}

/**
 * Collapsible header + list of placed entities in a map/world-map editor's
 * right-hand panel. Shared by MapEditorPanel and WorldMapEditorPanel.
 */
export function ItemsGroup({
  label,
  color,
  count,
  items,
  onAdd,
  addDisabled
}: {
  label: string
  color: string
  count: number
  items: ItemRow[]
  onAdd: () => void
  addDisabled?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <>
      <Box
        sx={{
          px: 1.5,
          py: 0.75,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          bgcolor: 'action.hover'
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 600 }}>
          {label}
        </Typography>
        <Chip label={count} size="small" sx={{ height: 16, fontSize: 10 }} />
        {!addDisabled && (
          <Tooltip title={`Place ${label.slice(0, -1)}`}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                onAdd()
              }}
              sx={{ p: 0.25 }}
            >
              <AddIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
        {open ? <ExpandLessIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
      </Box>
      <Collapse in={open}>
        {items.length === 0 ? (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ px: 2, py: 0.5, display: 'block' }}
          >
            None placed
          </Typography>
        ) : (
          <List dense disablePadding>
            {items.map((item) => (
              <ListItem
                key={item.key}
                disablePadding
                secondaryAction={
                  <Box sx={{ display: 'flex' }}>
                    {item.onEdit && (
                      <IconButton size="small" onClick={item.onEdit} sx={{ p: 0.25 }}>
                        <EditIcon sx={{ fontSize: 13 }} />
                      </IconButton>
                    )}
                    <IconButton size="small" onClick={item.onRemove} sx={{ p: 0.25 }}>
                      <DeleteIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemButton
                  selected={item.selected}
                  onClick={item.onSelect}
                  sx={{ py: 0.25, pr: 7 }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {item.isOrphan && (
                          <WarningAmberIcon
                            sx={{ fontSize: 12, color: 'warning.main', flexShrink: 0 }}
                          />
                        )}
                        <Typography
                          variant="caption"
                          fontFamily="monospace"
                          noWrap
                          sx={{ color: item.isOrphan ? 'warning.main' : undefined }}
                        >
                          {item.label}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Collapse>
    </>
  )
}
