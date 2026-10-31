/**
 * The example in the empty Brigid assets field, in the form of the folder that
 * main's `suggestedBrigidAssetsPath` fills in on this platform. Before, every
 * platform showed the Windows path, with `erisco` in lower case: Linux and macOS
 * see the case, and Brigid uses `Erisco` (HTOO-585).
 */
export function brigidAssetsExample(platform: string | undefined): string {
  if (platform === 'darwin') return 'e.g. ~/Library/Application Support/Erisco/Brigid/assets'
  if (platform === 'win32' || platform === undefined)
    return 'e.g. %LOCALAPPDATA%\\Erisco\\Brigid\\assets'
  return 'e.g. ~/.config/Erisco/Brigid/assets'
}
