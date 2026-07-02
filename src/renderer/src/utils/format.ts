/** Small display-formatting helpers shared across the renderer. */

/** Human-readable byte size (B / KB / MB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Last path segment, normalizing Windows backslashes first. */
export function filenameFromPath(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const slash = norm.lastIndexOf('/')
  return slash >= 0 ? norm.slice(slash + 1) : norm
}
