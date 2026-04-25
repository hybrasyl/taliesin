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
 *
 * Path fields backed by Recoil atoms typed `string | null` (clientPath,
 * packDir, companionPath, etc.) must be `.nullable().optional()` — App.tsx
 * forwards atom values straight into the save payload, and a single null
 * field would otherwise abort settings:save end-to-end.
 */
export const taliesinSettingsSchema = z.object({
  clientPath: z.string().nullable().optional(),
  libraries: z.array(z.string()),
  activeLibrary: z.string().nullable(),
  mapDirectories: z.array(mapDirectorySchema),
  activeMapDirectory: z.string().nullable(),
  theme: z.string().optional(),
  lastOpenedArchive: z.string().optional(),
  musicLibraryPath: z.string().nullable().optional(),
  musicWorkingDirs: z.array(z.string()),
  activeMusicWorkingDir: z.string().nullable().optional(),
  ffmpegPath: z.string().nullable().optional(),
  musEncodeKbps: z.number(),
  musEncodeSampleRate: z.number(),
  packDir: z.string().nullable().optional(),
  companionPath: z.string().nullable().optional()
})
