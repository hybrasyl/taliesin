import React, { useEffect, useState, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Chip,
  Divider,
  Tooltip,
  CircularProgress,
  Button,
  Stack
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import BuildIcon from '@mui/icons-material/Build'
import RefreshIcon from '@mui/icons-material/Refresh'
import HistoryIcon from '@mui/icons-material/History'
import GamepadIcon from '@mui/icons-material/Gamepad'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import { useRecoilValue, useSetRecoilState } from 'recoil'
import {
  clientPathState,
  activeLibraryState,
  currentPageState,
  packDirState,
  type Page
} from '../recoil/atoms'
import { useWorldIndex } from '../hooks/useWorldIndex'

// Index stat definitions — mirrors Creidhne pattern
const INDEX_TYPES: { key: string; label: string; page?: Page; tooltip?: string }[] = [
  { key: 'maps', label: 'Maps', page: 'mapeditor' },
  { key: 'worldmaps', label: 'World Maps', page: 'worldmap' },
  { key: 'npcs', label: 'NPCs', tooltip: 'Managed by Creidhne' },
  { key: 'items', label: 'Items', tooltip: 'Managed by Creidhne' },
  { key: 'castables', label: 'Castables', tooltip: 'Managed by Creidhne' },
  { key: 'creatures', label: 'Creatures', tooltip: 'Managed by Creidhne' },
  { key: 'statuses', label: 'Statuses', tooltip: 'Managed by Creidhne' },
  { key: 'nations', label: 'Nations', tooltip: 'Managed by Creidhne' },
  { key: 'spawngroups', label: 'Spawn Groups', tooltip: 'Managed by Creidhne' },
  { key: 'lootsets', label: 'Loot Sets', tooltip: 'Managed by Creidhne' },
  { key: 'recipes', label: 'Recipes', tooltip: 'Managed by Creidhne' },
  { key: 'variantgroups', label: 'Variant Groups', tooltip: 'Managed by Creidhne' },
  { key: 'creaturebehaviorsets', label: 'Behavior Sets', tooltip: 'Managed by Creidhne' },
  { key: 'elementtables', label: 'Element Tables', tooltip: 'Managed by Creidhne' },
  { key: 'localizations', label: 'Localizations', tooltip: 'Managed by Creidhne' },
  { key: 'serverconfigs', label: 'Server Configs', tooltip: 'Managed by Creidhne' },
  { key: 'scripts', label: 'Scripts', tooltip: 'Managed by Creidhne' }
]

const PAGE_LABELS: Partial<Record<Page, string>> = {
  dashboard: 'Dashboard',
  catalog: 'Map Catalog',
  mapeditor: 'Map XML Editor',
  worldmap: 'World Map Editor',
  archive: 'Archive Browser',
  mapmaker: 'Map Maker',
  prefabs: 'Prefab Catalog',
  assetpacks: 'Asset Packs',
  music: 'Music Manager',
  sfx: 'Sound Effects',
  settings: 'Settings'
}

function getFolderName(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean)
  const worldIdx = parts.findIndex((p) => p.toLowerCase() === 'world')
  if (worldIdx > 0) return parts[worldIdx - 1]
  return parts.pop() ?? fullPath
}

interface StatCardProps {
  label: string
  count: number
  page?: Page
  tooltip?: string
  onNavigate: (page: Page) => void
}

function StatCard({ label, count, page, tooltip, onNavigate }: StatCardProps) {
  const content = (
    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
      <Typography
        variant="h5"
        color={page ? 'primary.light' : 'text.primary'}
        sx={{ fontWeight: 'bold' }}
      >
        {count.toLocaleString()}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
    </CardContent>
  )

  const card = (
    <Card variant="outlined" sx={{ height: '100%' }}>
      {page ? (
        <CardActionArea onClick={() => onNavigate(page)} sx={{ height: '100%' }}>
          {content}
        </CardActionArea>
      ) : (
        content
      )}
    </Card>
  )

  return tooltip ? (
    <Tooltip title={tooltip} placement="top">
      {card}
    </Tooltip>
  ) : (
    card
  )
}

interface StatusCardProps {
  icon: React.ReactNode
  label: string
  /** Primary value when configured (e.g. folder name). Null = empty state. */
  primary: string | null
  /** Secondary detail (e.g. full path). Only rendered alongside `primary`. */
  secondary?: string | null
  /** Empty-state hint shown beneath "Not configured" when `primary` is null. */
  emptyHint?: string
  /** Whole-card click target. Used both when configured (e.g. open editor) and
   * when empty (e.g. open settings). When omitted the card is non-interactive. */
  onClick?: () => void
  /** Optional content rendered at the bottom of the card body (e.g. action
   * button or status chip). Used by the Index State card; suppresses the
   * whole-card CardActionArea so the inner control can receive clicks. */
  footer?: React.ReactNode
}

function StatusCard({ icon, label, primary, secondary, emptyHint, onClick, footer }: StatusCardProps) {
  const body = (
    <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>
        <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1 }}>
          {label}
        </Typography>
      </Stack>
      {primary ? (
        <>
          <Typography variant="subtitle1" sx={{ fontWeight: 'medium', lineHeight: 1.25 }}>
            {primary}
          </Typography>
          {secondary && (
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                wordBreak: 'break-all',
                display: 'block',
                mt: 0.25
              }}
            >
              {secondary}
            </Typography>
          )}
        </>
      ) : (
        <>
          <Typography
            variant="subtitle1"
            sx={{ fontStyle: 'italic', color: 'text.secondary', lineHeight: 1.25 }}
          >
            Not configured
          </Typography>
          {emptyHint && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
              {emptyHint}
            </Typography>
          )}
        </>
      )}
      {footer && <Box sx={{ mt: 1.25 }}>{footer}</Box>}
    </CardContent>
  )

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      {onClick && !footer ? (
        <CardActionArea onClick={onClick} sx={{ height: '100%' }}>
          {body}
        </CardActionArea>
      ) : (
        body
      )}
    </Card>
  )
}

const DashboardPage: React.FC = () => {
  const clientPath = useRecoilValue(clientPathState)
  const activeLibrary = useRecoilValue(activeLibraryState)
  const packDir = useRecoilValue(packDirState)
  const setCurrentPage = useSetRecoilState(currentPageState)
  const { index, loading: indexLoading, building, build } = useWorldIndex()

  const [recentPages, setRecentPages] = useState<Page[]>([])

  // Load recent pages from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('taliesin-recent-pages')
      if (stored) setRecentPages(JSON.parse(stored))
    } catch {
      /* ignore */
    }
  }, [])

  const navigateTo = useCallback(
    (page: Page) => {
      setCurrentPage(page)
      setRecentPages((prev) => {
        const filtered = prev.filter((p) => p !== page)
        const next = [page, ...filtered].slice(0, 8)
        localStorage.setItem('taliesin-recent-pages', JSON.stringify(next))
        return next
      })
    },
    [setCurrentPage]
  )

  const folderName = activeLibrary ? getFolderName(activeLibrary) : null
  const hasIndex = !!index?.builtAt
  const builtAt = hasIndex ? new Date((index as any).builtAt) : null

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>
        Dashboard
      </Typography>
      <Divider sx={{ mb: 3 }} />

      {/* Status cards: Active Library, Current Client, Asset Packs, Index State */}
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatusCard
            icon={<FolderOpenIcon fontSize="small" />}
            label="Active Library"
            primary={folderName}
            secondary={activeLibrary}
            emptyHint="Click to open Settings"
            onClick={() => navigateTo('settings')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatusCard
            icon={<GamepadIcon fontSize="small" />}
            label="Current Client"
            primary={clientPath ? clientPath.replace(/\\/g, '/').split('/').pop() ?? null : null}
            secondary={clientPath}
            emptyHint="Click to open Settings"
            onClick={() => navigateTo('settings')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatusCard
            icon={<Inventory2Icon fontSize="small" />}
            label="Asset Packs"
            primary={packDir ? packDir.replace(/\\/g, '/').split('/').pop() ?? null : null}
            secondary={packDir}
            emptyHint="Click to open Settings"
            onClick={() => navigateTo(packDir ? 'assetpacks' : 'settings')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatusCard
            icon={<BuildIcon fontSize="small" />}
            label="Index State"
            primary={
              hasIndex
                ? `Built ${builtAt!.toLocaleDateString()}`
                : activeLibrary
                  ? 'Not built'
                  : null
            }
            secondary={
              hasIndex
                ? builtAt!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : activeLibrary
                  ? 'Build the index to populate library stats below.'
                  : null
            }
            emptyHint="Set an active library in Settings first."
            onClick={!activeLibrary ? () => navigateTo('settings') : undefined}
            footer={
              activeLibrary ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={
                    building ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : hasIndex ? (
                      <RefreshIcon fontSize="small" />
                    ) : (
                      <BuildIcon fontSize="small" />
                    )
                  }
                  onClick={build}
                  disabled={building || indexLoading}
                >
                  {building ? 'Building…' : hasIndex ? 'Rebuild' : 'Build Index'}
                </Button>
              ) : undefined
            }
          />
        </Grid>
      </Grid>

      <Divider sx={{ mb: 3 }} />

      {/* Index stats */}
      {hasIndex && (
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {INDEX_TYPES.map(({ key, label, page, tooltip }) => {
            const arr = (index as any)?.[key]
            if (!arr) return null
            return (
              <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={key}>
                <StatCard
                  label={label}
                  count={arr.length}
                  page={page}
                  tooltip={tooltip}
                  onNavigate={navigateTo}
                />
              </Grid>
            )
          })}
        </Grid>
      )}

      {/* Recently visited */}
      {recentPages.length > 0 && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <HistoryIcon fontSize="small" color="action" />
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>
              Recently Visited
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {recentPages.map((page) => (
              <Chip
                key={page}
                label={PAGE_LABELS[page] ?? page}
                onClick={() => navigateTo(page)}
                clickable
                variant="outlined"
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  )
}

export default DashboardPage
