import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Tooltip,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  type SelectChangeEvent
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import SettingsIcon from '@mui/icons-material/Settings'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import { useSettingsStore } from '../store/settingsStore'
import { useUiStore } from '../store/uiStore'
import { useCatalog, worldName } from '../hooks/useCatalog'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog'
import MapCatalogList from '../components/catalog/MapCatalogList'
import MapCatalogEditor from '../components/catalog/MapCatalogEditor'
import MapExportDialog from '../components/catalog/MapExportDialog'

const LIST_WIDTH = 280

const CatalogPage: React.FC = () => {
  const activeMapDir = useSettingsStore((s) => s.activeMapDirectory)
  const activeLibrary = useSettingsStore((s) => s.activeLibrary)
  const clientPath = useSettingsStore((s) => s.clientPath)
  const mapDirectories = useSettingsStore((s) => s.mapDirectories)
  const setActiveMapDirectory = useSettingsStore((s) => s.setActiveMapDirectory)
  const setCurrentPage = useUiStore((s) => s.setCurrentPage)

  const {
    entries,
    selectedEntry,
    selectedFilename,
    draft,
    dirty,
    scanning,
    rescan,
    select,
    updateDraft,
    save,
    appendNote
  } = useCatalog(activeMapDir)

  const [exportOpen, setExportOpen] = useState(false)

  // Unsaved-draft guard. `useCatalog` owns `dirty`, so this mirrors it into the
  // shared guard rather than tracking it a second time; the guard is what gives
  // the source picker and the list its prompt, and it registers the page with
  // uiStore so cross-page navigation is intercepted too.
  const { markDirty, markClean, saveRef, guard, dialogOpen, ...dialog } =
    useUnsavedGuard('Map catalog')
  saveRef.current = async () => {
    await save()
  }
  useEffect(() => {
    if (dirty) markDirty()
    else markClean()
  }, [dirty, markDirty, markClean])

  const handleSourceChange = (e: SelectChangeEvent<string>): void => {
    const next = e.target.value
    if (next === activeMapDir) return
    // Switching source is the same code path as opening the page: `dirPath`
    // changes and useCatalog's effect reloads and clears the selection.
    guard(() => setActiveMapDirectory(next))
  }

  // ── Library context ───────────────────────────────────────────────────────────
  const importTarget = activeLibrary ? worldName(activeLibrary) : null

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!activeMapDir) {
    return (
      <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <Typography
          variant="h6"
          sx={{
            color: 'text.secondary'
          }}
        >
          No active map directory
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary'
          }}
        >
          Add and activate a map directory in Settings to use the catalog.
        </Typography>
        <Button
          variant="outlined"
          startIcon={<SettingsIcon />}
          onClick={() => setCurrentPage('settings')}
        >
          Open Settings
        </Button>
      </Box>
    )
  }

  // ── Main layout ──────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: list panel */}
      <Box
        sx={{
          width: LIST_WIDTH,
          minWidth: LIST_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          height: '100%'
        }}
      >
        {/* Toolbar */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            px: 1.5,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            flexShrink: 0
          }}
        >
          {/* Map source. Writes through to the global active map directory:
              "which map directory am I working in" is a session-wide answer, and
              a catalog-local override would leave the two silently disagreeing. */}
          {mapDirectories.length > 1 && (
            <FormControl size="small" fullWidth disabled={scanning}>
              <InputLabel id="catalog-source-label">Map source</InputLabel>
              <Select
                labelId="catalog-source-label"
                label="Map source"
                value={mapDirectories.some((d) => d.path === activeMapDir) ? activeMapDir : ''}
                onChange={handleSourceChange}
              >
                {mapDirectories.map((dir) => (
                  <MenuItem key={dir.path} value={dir.path}>
                    {dir.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Re-read the directory to pick up .map files added since the page loaded">
              <span>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={
                    scanning ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />
                  }
                  onClick={rescan}
                  disabled={scanning}
                >
                  {scanning ? 'Scanning…' : 'Rescan'}
                </Button>
              </span>
            </Tooltip>
            {entries.length === 0 && !scanning && (
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary'
                }}
              >
                No maps found
              </Typography>
            )}
          </Box>
          {/* Library import target */}
          {importTarget ? (
            <Tooltip title={`Maps will be exported to the ${importTarget} XML library`}>
              <Chip
                size="small"
                icon={<FileUploadIcon />}
                label={`Importing to: ${importTarget}`}
                color="default"
                variant="outlined"
                sx={{ alignSelf: 'flex-start', fontSize: '0.7rem', height: 20 }}
              />
            </Tooltip>
          ) : (
            <Typography
              variant="caption"
              sx={{
                color: 'text.disabled',
                fontSize: '0.7rem'
              }}
            >
              No library selected
            </Typography>
          )}
        </Box>

        <MapCatalogList
          entries={entries}
          selectedFilename={selectedFilename}
          onSelect={(filename) => guard(() => select(filename))}
        />
      </Box>
      {/* Right: editor panel */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedEntry ? (
          <>
            <MapCatalogEditor
              entry={selectedEntry}
              draft={draft}
              dirty={dirty}
              dirPath={activeMapDir}
              clientPath={clientPath}
              onUpdateDraft={updateDraft}
              onSave={save}
              onExport={() => setExportOpen(true)}
            />
            {exportOpen && (
              <MapExportDialog
                open={exportOpen}
                entry={selectedEntry}
                dirPath={activeMapDir}
                activeLibrary={activeLibrary}
                onClose={() => setExportOpen(false)}
                onExported={(filename, note) => appendNote(filename, note)}
              />
            )}
          </>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary'
              }}
            >
              {entries.length === 0
                ? 'No .map files in this directory.'
                : 'Select a map from the list.'}
            </Typography>
          </Box>
        )}
      </Box>

      <UnsavedChangesDialog
        open={dialogOpen}
        label={selectedEntry?.filename ?? null}
        onSave={dialog.handleDialogSave}
        onDiscard={dialog.handleDialogDiscard}
        onCancel={dialog.handleDialogCancel}
      />
    </Box>
  )
}

export default CatalogPage
