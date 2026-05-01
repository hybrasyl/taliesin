import React, { useEffect, useState } from 'react'
import { Box } from '@mui/material'

interface Props {
  packDir: string
  filename: string
  size?: number
}

// Loads a PNG via the IPC readFile bridge and renders it through a Blob URL.
// Avoids file:// (Electron's webSecurity blocks it / taints the canvas) and
// keeps the URL lifecycle scoped to the component so we don't leak object
// URLs as the user scrolls the asset table.
const AssetThumbnail: React.FC<Props> = ({ packDir, filename, size = 32 }) => {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    const absPath = `${packDir}/${filename}`
    // Wrap in Promise.resolve so an undefined return (e.g. from a mocked api
    // in tests) becomes a resolved-undefined promise instead of crashing on
    // .then.
    Promise.resolve(window.api.readFile(absPath))
      .then((bytes) => {
        if (cancelled || !bytes) return
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
        setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [packDir, filename])

  if (!src) {
    return <Box sx={{ width: size, height: size, backgroundColor: '#1a1a2e' }} />
  }
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={filename}
      style={{ imageRendering: 'pixelated', backgroundColor: '#1a1a2e' }}
    />
  )
}

export default AssetThumbnail
