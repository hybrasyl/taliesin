import React, { useEffect, useState, useCallback } from 'react'
import {
  Box, Typography, Card, CardContent, CardActionArea, Grid, Chip, Divider,
  Alert, IconButton, Tooltip, CircularProgress, Button,
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import BuildIcon from '@mui/icons-material/Build'
import RefreshIcon from '@mui/icons-material/Refresh'
import SettingsIcon from '@mui/icons-material/Settings'
import HistoryIcon from '@mui/icons-material/History'
import GamepadIcon from '@mui/icons-material/Gamepad'
import { useRecoilValue, useSetRecoilState } from 'recoil'
import {
  clientPathState, activeLibraryState, currentPageState, packDirState, type Page,
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
  { key: 'scripts', label: 'Scripts', tooltip: 'Managed by Creidhne' },
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
  settings: 'Settings',
}

function getFolderName(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean)
  const worldIdx = parts.findIndex(p => p.toLowerCase() === 'world')
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
      <Typography variant="h5" color={page ? 'primary.light' : 'text.primary'} sx={{ fontWeight: 'bold' }}>
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
    <Tooltip title={tooltip} placement="top">{card}</Tooltip>
  ) : card
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
    } catch { /* ignore */ }
  }, [])

  const navigateTo = useCallback((page: Page) => {
    setCurrentPage(page)
    setRecentPages(prev => {
      const filtered = prev.filter(p => p !== page)
      const next = [page, ...filtered].slice(0, 8)
      localStorage.setItem('taliesin-recent-pages', JSON.stringify(next))
      return next
    })
  }, [setCurrentPage])

  const folderName = activeLibrary ? getFolderName(activeLibrary) : null
  const hasIndex = !!index?.builtAt
  const builtAt = hasIndex ? new Date((index as any).builtAt) : null

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>
        Dashboard
      </Typography>
      <Divider sx={{ mb: 3 }} />

      {/* Active Library */}
      {activeLibrary ? (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 3 }}>
          <FolderOpenIcon color="action" sx={{ mt: 0.25 }} />
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1 }}>
              Active Library
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 'medium', mt: 0.25 }}>
              {folderName}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', wordBreak: 'break-all' }}>
              {activeLibrary}
            </Typography>
          </Box>
        </Box>
      ) : (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardActionArea onClick={() => navigateTo('settings')} sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FolderOpenIcon color="action" fontSize="large" />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                  No library selected
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Click to open Settings and add a library
                </Typography>
              </Box>
              <SettingsIcon color="action" />
            </Box>
          </CardActionArea>
        </Card>
      )}

      {/* Configured paths */}
      {(clientPath || packDir) && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
          {clientPath && (
            <Chip
              icon={<GamepadIcon />}
              label={`Client: ${clientPath.replace(/\\/g, '/').split('/').pop()}`}
              size="small"
              variant="outlined"
            />
          )}
          {packDir && (
            <Chip
              icon={<FolderOpenIcon />}
              label={`Packs: ${packDir.replace(/\\/g, '/').split('/').pop()}`}
              size="small"
              variant="outlined"
              onClick={() => navigateTo('assetpacks')}
              clickable
            />
          )}
        </Box>
      )}

      {/* No index alert */}
      {activeLibrary && !hasIndex && !indexLoading && (
        <Alert
          severity="info"
          icon={<BuildIcon />}
          sx={{ mb: 3 }}
          action={
            <Button size="small" onClick={build} disabled={building}>
              {building ? <CircularProgress size={16} /> : 'Build Index'}
            </Button>
          }
        >
          No index found — build one to see library stats here.
        </Alert>
      )}

      {/* Index stats */}
      {hasIndex && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>
              Index
            </Typography>
            <Chip
              label={`Built ${builtAt!.toLocaleDateString()} ${builtAt!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              size="small"
              color="success"
              variant="outlined"
            />
            <Tooltip title={building ? 'Building...' : 'Rebuild index'}>
              <span>
                <IconButton size="small" onClick={build} disabled={building}>
                  {building ? (
                    <CircularProgress size={14} color="success" />
                  ) : (
                    <RefreshIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          </Box>

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
        </>
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
            {recentPages.map(page => (
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
