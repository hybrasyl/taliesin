/**
 * The rule for a name that becomes one path segment on disk: a pack id that
 * names a folder and a project file, or an archive entry that names an
 * extracted file (HTOO-676, HTOO-677).
 *
 * The name comes from a file the user opened, not from the user. A `.datf`
 * manifest or a `.dat` entry table can hold any string, and `join` or a
 * template string gives that string the power to address a different folder.
 * This rule lets through only a name that stays one segment in the folder it is
 * joined into, on every platform the app runs on.
 *
 * Electron-free and node-free: main and the renderer both load it.
 */

/** Windows device names. They are refused with or without an extension. */
const RESERVED_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** Control characters and the characters Windows does not allow in a name. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHAR = /[\x00-\x1f<>:"|?*]/

/** The longest name allowed. Most filesystems stop at 255 bytes. */
export const MAX_FILE_NAME_LENGTH = 255

/**
 * Why `name` is not a plain file name, or null when it is.
 *
 * Refused: an empty name, `.` and `..`, any name made only of dots, a path
 * separator of either kind, a drive or stream colon, a control character, a
 * character Windows forbids, a trailing dot or space (Windows removes them, so
 * `a.` and `a` are one file), a Windows device name, and a name longer than
 * `maxLength`.
 */
export function plainFileNameProblem(
  name: string,
  maxLength: number = MAX_FILE_NAME_LENGTH
): string | null {
  if (name.length === 0) return 'the name is empty'
  if (name.length > maxLength) return `the name is longer than ${maxLength} characters`
  if (/^\.+$/.test(name)) return 'the name is only dots'
  if (/[\\/]/.test(name)) return 'the name has a path separator'
  if (FORBIDDEN_CHAR.test(name))
    return 'the name has a character that is not allowed in a file name'
  if (/[. ]$/.test(name)) return 'the name ends with a dot or a space'
  if (RESERVED_DEVICE.test(name)) return 'the name is a reserved device name'
  return null
}
