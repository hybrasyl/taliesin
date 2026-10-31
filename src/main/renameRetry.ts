import { promises as fs } from 'fs'

// Windows occasionally returns EPERM/EACCES on rename when AV scanners or
// file watchers briefly hold the destination open. Back off a few times
// before falling back to unlink+rename. Lifted from creidhne's
// settingsManager.js. Without this, atomic saves silently fail under common
// Windows configurations. The settings save and the pack compile use it.
export async function renameWithRetry(
  src: string,
  dest: string,
  retries = 3,
  delay = 50
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.rename(src, dest)
      return
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code !== 'EPERM' && e.code !== 'EACCES') throw err
      await new Promise((r) => setTimeout(r, delay * (i + 1)))
    }
  }
  try {
    await fs.unlink(dest)
  } catch {
    /* dest may not exist */
  }
  await fs.rename(src, dest)
}
