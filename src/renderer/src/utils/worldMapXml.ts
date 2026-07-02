import type { WorldMapData, WorldMapPoint } from '../data/worldMapData'
import { escapeXml as esc, attr, childText, parseXmlDocument } from './xmlUtils'

// ── Parse ─────────────────────────────────────────────────────────────────────

export function parseWorldMapXml(xml: string): WorldMapData {
  const root = parseXmlDocument(xml).documentElement

  const points: WorldMapPoint[] = []
  for (const pointEl of root.querySelectorAll('Points > Point')) {
    const targetEl = pointEl.querySelector(':scope > Target')
    points.push({
      x: parseInt(attr(pointEl, 'X', '0'), 10),
      y: parseInt(attr(pointEl, 'Y', '0'), 10),
      name: childText(pointEl, 'Name'),
      targetMap: targetEl?.textContent?.trim() ?? '',
      targetX: targetEl ? parseInt(attr(targetEl, 'X', '0'), 10) : 0,
      targetY: targetEl ? parseInt(attr(targetEl, 'Y', '0'), 10) : 0
    })
  }

  return {
    name: childText(root, 'Name'),
    clientMap: attr(root, 'ClientMap'),
    points
  }
}

// ── Serialize ─────────────────────────────────────────────────────────────────

export function serializeWorldMapXml(data: WorldMapData): string {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="utf-8"?>')
  lines.push(
    `<WorldMap ClientMap="${esc(data.clientMap)}" xmlns="http://www.hybrasyl.com/XML/Hybrasyl/2020-02">`
  )
  lines.push(`  <Name>${esc(data.name)}</Name>`)

  if (data.points.length > 0) {
    lines.push('  <Points>')
    for (const p of data.points) {
      lines.push(`    <Point X="${p.x}" Y="${p.y}">`)
      lines.push(`      <Name>${esc(p.name)}</Name>`)
      lines.push(`      <Target X="${p.targetX}" Y="${p.targetY}">${esc(p.targetMap)}</Target>`)
      lines.push('    </Point>')
    }
    lines.push('  </Points>')
  }

  lines.push('</WorldMap>')
  return lines.join('\n')
}
