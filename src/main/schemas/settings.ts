import { z } from 'zod'

const mapDirectorySchema = z.object({
  path: z.string(),
  name: z.string()
})

/**
 * Schema for `settings:save` payload — mirrors the TaliesinSettings interface
 * in `../settingsManager.ts`. Optional fields stay optional; required arrays
 * default to []. Extra fields pass through (zod default) so a settings.json
 * carrying renderer-only state doesn't get rejected.
 */
export const taliesinSettingsSchema = z.object({
  clientPath: z.string().optional(),
  libraries: z.array(z.string()),
  activeLibrary: z.string().nullable(),
  mapDirectories: z.array(mapDirectorySchema),
  activeMapDirectory: z.string().nullable(),
  theme: z.string().optional(),
  lastOpenedArchive: z.string().optional(),
  musicLibraryPath: z.string().optional(),
  musicWorkingDirs: z.array(z.string()),
  activeMusicWorkingDir: z.string().optional(),
  ffmpegPath: z.string().optional(),
  musEncodeKbps: z.number(),
  musEncodeSampleRate: z.number(),
  packDir: z.string().optional(),
  companionPath: z.string().optional()
})
