import React, { useState } from 'react'
import { Box, Typography, Button, CircularProgress, Tooltip, Chip } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import SettingsIcon from '@mui/icons-material/Settings'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import { useRecoilState, useRecoilValue } from 'recoil'
import {
  activeMapDirectoryState,
  activeLibraryState,
  clientPathState,
  currentPageState
} from '../recoil/atoms'
import { useCatalog, worldName } from '../hooks/useCatalog'
import MapCatalogList from '../components/catalog/MapCatalogList'
import MapCatalogEditor from '../components/catalog/MapCatalogEditor'
import MapExportDialog from '../components/catalog/MapExportDialog'

const LIST_WIDTH = 280

const CatalogPage: React.FC = () => {
  const activeMapDir = useRecoilValue(activeMapDirectoryState)
  const activeLibrary = useRecoilValue(activeLibraryState)
  const clientPath = useRecoilValue(clientPathState)
  const [, setCurrentPage] = useRecoilState(currentPageState)

  const {
    entries,
    selectedEntry,
    selectedFilename,
    draft,
    dirty,
    scanning,
    scan,
    select,
    updateDraft,
    save,
    appendNote
  } = useCatalog(activeMapDir)

  const [exportOpen, setExportOpen] = useState(false)

  // ── Library context ───────────────────────────────────────────────────────────
  const importTarget = activeLibrary ? worldName(activeLibrary) : null

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!activeMapDir) {
    return (
      <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <Typography variant="h6" color="text.secondary">
          No active map directory
        </Typography>
        <Typography variant="body2" color="text.secondary">
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Scan directory for .map files">
              <span>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={
                    scanning ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />
                  }
                  onClick={scan}
                  disabled={scanning}
                >
                  {scanning ? 'Scanning…' : entries.length === 0 ? 'Scan' : 'Rescan'}
                </Button>
              </span>
            </Tooltip>
            {entries.length === 0 && !scanning && (
              <Typography variant="caption" color="text.secondary">
                No maps loaded
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
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
              No library selected
            </Typography>
          )}
        </Box>

        <MapCatalogList entries={entries} selectedFilename={selectedFilename} onSelect={select} />
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
            <Typography variant="body2" color="text.secondary">
              {entries.length === 0
                ? 'Scan a directory to load maps.'
                : 'Select a map from the list.'}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default CatalogPage
