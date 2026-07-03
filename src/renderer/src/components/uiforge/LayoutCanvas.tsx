import React, { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import type { UiControlKind, UiPanelLayout, UiVariant } from '../../uiforge/types'

export const KIND_COLORS: Record<UiControlKind, string> = {
  label: '#4fc3f7',
  button: '#ffb74d',
  image: '#81c784',
  textbox: '#ba68c8',
  progressbar: '#e57373'
}

export type ForgeZoom = 1 | 2 | 4

interface LayoutCanvasProps {
  layout: UiPanelLayout
  variant: UiVariant
  zoom: ForgeZoom
  /** Blob URL of the variant's background PNG, resolved by the parent. */
  backgroundUrl: string | null
  selectedControl?: string | null
  onCanvasPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onCanvasPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onCanvasPointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  cursor?: string
}

/**
 * Two stacked canvases (MapRenderCanvas idiom): base draws the background PNG
 * point-filtered to the anchor's logical size × zoom (previewing the client's
 * 2×/4× downscale rule); overlay draws control outlines, names, selection.
 */
const LayoutCanvas: React.FC<LayoutCanvasProps> = ({
  layout,
  variant,
  zoom,
  backgroundUrl,
  selectedControl,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  cursor
}) => {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  const cw = Math.max(1, layout.anchor.w * zoom)
  const ch = Math.max(1, layout.anchor.h * zoom)

  // Base: background image (or neutral fill), redrawn on variant/zoom/bg change.
  useEffect(() => {
    const canvas = baseRef.current
    if (!canvas) return
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, cw, ch)
    ctx.fillStyle = '#1c1c22'
    ctx.fillRect(0, 0, cw, ch)
    if (!backgroundUrl) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled || !baseRef.current) return
      // Point-filter scale to the anchor's logical size regardless of the
      // PNG's pixel dimensions — the format's resolution rule.
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, cw, ch)
    }
    img.src = backgroundUrl
    return () => {
      cancelled = true
    }
  }, [backgroundUrl, cw, ch])

  // Overlay: control rects + names + selection, redrawn on any change.
  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, cw, ch)

    for (const c of variant.controls) {
      const x = c.rect.x * zoom
      const y = c.rect.y * zoom
      const w = c.rect.w * zoom
      const h = c.rect.h * zoom
      const color = KIND_COLORS[c.kind]
      const isSelected = c.name === selectedControl

      ctx.strokeStyle = color
      ctx.lineWidth = isSelected ? 2 : 1
      ctx.setLineDash(isSelected ? [] : [4, 3])
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1))
      ctx.setLineDash([])

      // Name tag above the rect (inside it when at the top edge).
      ctx.font = '9px monospace'
      const tagY = y >= 10 ? y - 2 : y + 9
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      const tw = ctx.measureText(c.name).width
      ctx.fillRect(x, tagY - 8, tw + 4, 10)
      ctx.fillStyle = color
      ctx.fillText(c.name, x + 2, tagY)

      if (isSelected) {
        // Resize handles at corners + edge midpoints (interaction lands later;
        // drawn now so selection reads clearly).
        ctx.fillStyle = color
        const hs = 3
        const xs = [x, x + w / 2, x + w]
        const ys = [y, y + h / 2, y + h]
        for (const hx of xs) {
          for (const hy of ys) {
            if (hx === x + w / 2 && hy === y + h / 2) continue
            ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2)
          }
        }
      }
    }
  }, [variant, zoom, cw, ch, selectedControl])

  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        p: 2,
        // subtle checkerboard so panel bounds are obvious
        backgroundImage:
          'linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.03) 75%), linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.03) 75%)',
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 8px 8px'
      }}
    >
      <Box
        sx={{
          display: 'inline-block',
          position: 'relative',
          border: '1px solid',
          borderColor: 'divider',
          lineHeight: 0
        }}
      >
        <canvas ref={baseRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
        <canvas
          ref={overlayRef}
          data-testid="forge-overlay"
          style={{ position: 'absolute', top: 0, left: 0, display: 'block', cursor }}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
        />
      </Box>
    </Box>
  )
}

export default LayoutCanvas
