import { useCallback, useEffect, useRef, useState } from 'react'

/** Raw audio bytes plus their MIME type, ready to wrap in a blob: URL. */
export interface AudioBytes {
  bytes: ArrayLike<number> | ArrayBuffer
  mime: string
}

export interface UseAudioPreview<K> {
  /** The key currently playing, or null when stopped. */
  playing: K | null
  /** Whether `key` is the one currently playing. */
  isPlaying: (key: K) => boolean
  /** Last playback error message, or null. */
  error: string | null
  /**
   * Toggle playback for `key`. If `key` is already playing it stops; otherwise
   * `load()` is awaited for the audio bytes, which are played through a shared
   * `<audio>` element via a blob: URL (CSP allows `media-src blob:` but blocks
   * `<audio src=data:>`). A null result is a silent no-op; a throw sets `error`.
   */
  toggle: (key: K, load: () => Promise<AudioBytes | null>) => Promise<void>
  /** Stop playback, revoke the current blob URL, and clear `playing`. */
  stop: () => void
}

/**
 * Owns the audio-element + blob-URL lifecycle for a one-track-at-a-time preview.
 * Shared by the map editor's Music Id field, the music picker dialog, and the
 * archive audio preview — each previously hand-rolled the same
 * audioRef/blobUrlRef/createObjectURL/revoke/onended dance.
 *
 * `K` identifies what is playing: a boolean sentinel for single-instance
 * previews (pass `true`), or e.g. a track id for a list where any row can play.
 */
export function useAudioPreview<K = boolean>(
  fallbackError = 'Failed to play audio'
): UseAudioPreview<K> {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const [playing, setPlaying] = useState<K | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    audioRef.current?.pause()
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setPlaying(null)
    setError(null)
  }, [])

  // Pause + revoke on unmount.
  useEffect(() => stop, [stop])

  const toggle = useCallback(
    async (key: K, load: () => Promise<AudioBytes | null>) => {
      if (playing === key) {
        stop()
        return
      }
      stop() // also clears any prior error
      try {
        const src = await load()
        if (!src) return
        const url = URL.createObjectURL(new Blob([new Uint8Array(src.bytes)], { type: src.mime }))
        blobUrlRef.current = url
        if (!audioRef.current) audioRef.current = new Audio()
        const audio = audioRef.current
        audio.src = url
        audio.onended = () => setPlaying(null)
        audio.onerror = () => {
          setPlaying(null)
          setError('Playback failed')
        }
        await audio.play()
        setPlaying(key)
      } catch (e) {
        setError(e instanceof Error ? e.message : fallbackError)
        setPlaying(null)
      }
    },
    [playing, stop, fallbackError]
  )

  const isPlaying = useCallback((key: K) => playing === key, [playing])

  return { playing, isPlaying, error, toggle, stop }
}
