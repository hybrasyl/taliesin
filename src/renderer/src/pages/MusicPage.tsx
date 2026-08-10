import React, { useState, useCallback } from 'react'
import { Box, Tabs, Tab, Typography, Button, Alert, LinearProgress } from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { useSettingsStore } from '../store/settingsStore'
import {
  useMusicLibrary,
  countEntriesWithLongTags,
  needsEnrichment
} from '../hooks/useMusicLibrary'
import { useMusicPacks } from '../hooks/useMusicPacks'
import MusicList from '../components/music/MusicList'
import MusicMetaEditor from '../components/music/MusicMetaEditor'
import MusicPlayer from '../components/music/MusicPlayer'
import PacksPanel from '../components/music/PacksPanel'
import ClientMusicView from '../components/music/ClientMusicView'

const MusicPage: React.FC = () => {
  const [tab, setTab] = useState(0)

  const musicLibraryPath = useSettingsStore((s) => s.musicLibraryPath)
  const setMusicLibraryPath = useSettingsStore((s) => s.setMusicLibraryPath)
  const musicWorkingDirs = useSettingsStore((s) => s.musicWorkingDirs)
  const activeMusicWorkingDir = useSettingsStore((s) => s.activeMusicWorkingDir)
  const clientPath = useSettingsStore((s) => s.clientPath)
  const ffmpegPath = useSettingsStore((s) => s.ffmpegPath)
  const musEncodeKbps = useSettingsStore((s) => s.musEncodeKbps)
  const musEncodeSampleRate = useSettingsStore((s) => s.musEncodeSampleRate)

  // The world index is deliberately not loaded here. It was read only to build a
  // map cross-reference that could never resolve — mapDetails carries no `music`
  // field — so the page paid for an index load and showed an empty answer that
  // looked like a real one. See HTOO-169.

  // Library hook
  const lib = useMusicLibrary(musicLibraryPath)

  // Packs hook
  const packsHook = useMusicPacks(musicLibraryPath)

  // Player state
  const [playingFile, setPlayingFile] = useState<string | null>(null)
  const [playingName, setPlayingName] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)

  const handlePlay = useCallback(
    (filename: string, displayName: string) => {
      if (!musicLibraryPath) return
      const path = `${musicLibraryPath}/${filename}`.replace(/\\/g, '/')
      if (playingFile === path) {
        setIsPlaying((p) => !p)
      } else {
        setPlayingFile(path)
        setPlayingName(displayName)
        setIsPlaying(true)
      }
    },
    [musicLibraryPath, playingFile]
  )

  const handlePlayAbsolute = useCallback(
    (filePath: string, displayName: string) => {
      if (playingFile === filePath) {
        setIsPlaying((p) => !p)
      } else {
        setPlayingFile(filePath)
        setPlayingName(displayName)
        setIsPlaying(true)
      }
    },
    [playingFile]
  )

  const handleSelectTrack = useCallback(
    (filename: string) => {
      lib.select(filename)
    },
    [lib]
  )

  const handleImport = useCallback(async () => {
    if (!musicLibraryPath) return
    const filePath = await window.api.openFile([
      { name: 'Audio Files', extensions: ['mp3', 'ogg', 'mus', 'wav', 'flac'] }
    ])
    if (!filePath) return
    const filename = filePath.split(/[\\/]/).pop()!
    const dest = `${musicLibraryPath}/${filename}`
    await window.api.copyFile(filePath, dest)
    await lib.scan()
  }, [musicLibraryPath, lib])

  const handleAddToSelectedPack = useCallback(
    (filename: string) => {
      if (!packsHook.selectedPackId) return
      const nextId =
        (packsHook.selectedPack?.tracks.reduce((m, t) => Math.max(m, t.musicId), 0) ?? 0) + 1
      packsHook.addTrack(packsHook.selectedPackId, filename, nextId)
    },
    [packsHook]
  )

  // No library configured
  if (!musicLibraryPath) {
    return (
      <Box sx={{ p: 4, maxWidth: 500 }}>
        <Typography variant="h5" gutterBottom sx={{ color: 'text.button', fontWeight: 'bold' }}>
          Music Manager
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            mb: 3
          }}
        >
          Configure a music library directory to get started. This is where your source audio files
          (.mp3, .ogg, .mus) are stored.
        </Typography>
        <Button
          variant="contained"
          startIcon={<FolderOpenIcon />}
          onClick={async () => {
            const dir = await window.api.openDirectory()
            if (dir) setMusicLibraryPath(dir)
          }}
        >
          Select Music Library Folder
        </Button>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: '1px solid', borderColor: 'divider', minHeight: 40 }}
        slotProps={{
          indicator: { style: { height: 2 } }
        }}
      >
        <Tab label="Library" sx={{ minHeight: 40, py: 0 }} />
        <Tab label="Packs" sx={{ minHeight: 40, py: 0 }} />
        <Tab label="Client View" sx={{ minHeight: 40, py: 0 }} />
      </Tabs>
      {/* Tab content */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Library Tab */}
        {tab === 0 && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Enrich tags bar */}
            {lib.enrichProgress ? (
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider'
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    flexShrink: 0
                  }}
                >
                  Reading tags: {lib.enrichProgress.done} / {lib.enrichProgress.total}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={(lib.enrichProgress.done / lib.enrichProgress.total) * 100}
                  sx={{ flex: 1 }}
                />
              </Box>
            ) : lib.entries.length > 0 ? (
              (() => {
                const unenriched = lib.entries.filter((e) =>
                  needsEnrichment(lib.metadata[e.filename])
                ).length
                const longTagCount = countEntriesWithLongTags(lib.metadata)
                return (
                  <Box
                    sx={{
                      px: 2,
                      py: 0.75,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      flexWrap: 'wrap'
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary'
                      }}
                    >
                      {unenriched > 0
                        ? `${unenriched} of ${lib.entries.length} tracks need enrichment`
                        : `${lib.entries.length} tracks`}
                      {longTagCount > 0 ? ` · ${longTagCount} with overlong tags` : ''}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    {unenriched > 0 && (
                      <Button size="small" variant="text" onClick={() => lib.enrichAll()}>
                        Read tags from files
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => lib.enrichAll({ force: true })}
                    >
                      Refresh all from files
                    </Button>
                    <Button size="small" variant="text" onClick={lib.migrateLongTags}>
                      Clean up long tags
                    </Button>
                  </Box>
                )
              })()
            ) : null}
            <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Left: track list */}
              <Box
                sx={{
                  width: 300,
                  flexShrink: 0,
                  borderRight: '1px solid',
                  borderColor: 'divider',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <MusicList
                  entries={lib.entries}
                  metadata={lib.metadata}
                  selectedFilename={lib.selectedFilename}
                  scanning={lib.scanning}
                  onSelect={handleSelectTrack}
                  onScan={lib.scan}
                  onImport={handleImport}
                />
              </Box>

              {/* Right: metadata editor */}
              <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {lib.entries.length === 0 && !lib.scanning ? (
                  <Box sx={{ p: 3 }}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      No audio files found in <strong>{musicLibraryPath}</strong>
                    </Alert>
                    <Button variant="outlined" onClick={lib.scan}>
                      Scan Directory
                    </Button>
                  </Box>
                ) : (
                  <>
                    <MusicMetaEditor
                      entry={lib.selectedEntry}
                      meta={lib.selectedMeta}
                      draft={lib.draft}
                      dirty={lib.dirty}
                      onUpdate={lib.updateDraft}
                      onSave={lib.save}
                      onPlay={() => {
                        if (lib.selectedEntry) {
                          const name = lib.draft.name || lib.selectedEntry.filename
                          handlePlay(lib.selectedEntry.filename, name)
                        }
                      }}
                      onRemove={() => {
                        if (lib.selectedFilename) lib.remove(lib.selectedFilename)
                      }}
                      isPlaying={
                        isPlaying &&
                        playingFile ===
                          `${musicLibraryPath}/${lib.selectedFilename}`.replace(/\\/g, '/')
                      }
                    />
                    {/* Add to pack shortcut */}
                    {lib.selectedEntry && packsHook.selectedPack && (
                      <Box sx={{ px: 2, pb: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleAddToSelectedPack(lib.selectedEntry!.filename)}
                          disabled={packsHook.selectedPack?.tracks.some(
                            (t) => t.sourceFile === lib.selectedEntry?.filename
                          )}
                        >
                          {packsHook.selectedPack?.tracks.some(
                            (t) => t.sourceFile === lib.selectedEntry?.filename
                          )
                            ? `Already in "${packsHook.selectedPack.name}"`
                            : `Add to "${packsHook.selectedPack.name}"`}
                        </Button>
                      </Box>
                    )}
                  </>
                )}
              </Box>
            </Box>
          </Box>
        )}

        {/* Packs Tab */}
        {tab === 1 && (
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <PacksPanel
              packs={packsHook.packs}
              selectedPack={packsHook.selectedPack}
              selectedPackId={packsHook.selectedPackId}
              libraryEntries={lib.entries}
              metadata={lib.metadata}
              musicWorkingDirs={musicWorkingDirs}
              activeMusicWorkingDir={activeMusicWorkingDir}
              onSelectPack={packsHook.setSelectedPackId}
              onCreatePack={packsHook.createPack}
              onRenamePack={packsHook.renamePack}
              onDeletePack={packsHook.deletePack}
              onAddTrack={packsHook.addTrack}
              onRemoveTrack={packsHook.removeTrack}
              onReorderTracks={packsHook.reorderTracks}
              onUpdateTrackId={packsHook.updateTrackId}
              onDeploy={(packId, destDir) =>
                packsHook.deployPack(
                  packId,
                  musicLibraryPath!,
                  destDir,
                  ffmpegPath,
                  musEncodeKbps,
                  musEncodeSampleRate
                )
              }
            />
          </Box>
        )}

        {/* Client View Tab */}
        {tab === 2 && (
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <ClientMusicView
              clientPath={clientPath}
              playingFile={playingFile}
              isPlaying={isPlaying}
              onPlay={handlePlayAbsolute}
            />
          </Box>
        )}
      </Box>
      {/* Persistent player bar */}
      <MusicPlayer
        filePath={playingFile}
        trackName={playingName}
        playing={isPlaying}
        onPlayingChange={setIsPlaying}
      />
    </Box>
  )
}

export default MusicPage
