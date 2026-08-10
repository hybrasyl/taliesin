import React, { useEffect, useState } from 'react'
import { Snackbar, Alert, Link } from '@mui/material'

/**
 * "A newer version exists" notice (HTOO-65).
 *
 * Checked once when the app mounts, never on a timer. `window.api.checkForUpdate`
 * answers `null` for current, offline, rate-limited and every other failure
 * alike, so there is exactly one thing to render and nothing to explain when the
 * check does not work.
 *
 * **The link is an ordinary `target="_blank"` anchor, deliberately.** The
 * renderer has no way to open a URL directly and should not gain one:
 * `hardenWindow`'s window-open handler already denies the child window and hands
 * the URL to `isSafeExternalUrl` before `shell.openExternal` sees it. Adding an
 * IPC for this would route around a guard that exists.
 *
 * **This does not download or install anything**, which is the whole shape of the
 * house's answer — creidhne and corvath both notify and stop, rather than
 * carrying `electron-updater`. The bundled "What's new" dialog is a different
 * thing and stays as it is: it ships inside the asar, so it can only ever
 * describe the version already installed.
 */
const UpdateSnackbar: React.FC = () => {
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api
      .checkForUpdate()
      .then((info) => !cancelled && setUpdate(info))
      // The handler already swallows everything; this covers the IPC itself.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!update || dismissed) return null

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      onClose={() => setDismissed(true)}
    >
      <Alert severity="info" variant="filled" onClose={() => setDismissed(true)}>
        Taliesin {update.version} is available.{' '}
        <Link href={update.url} target="_blank" rel="noreferrer" color="inherit" underline="always">
          Release notes
        </Link>
      </Alert>
    </Snackbar>
  )
}

export default UpdateSnackbar
