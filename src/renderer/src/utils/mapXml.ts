import type {
  MapData,
  MapFlag,
  MapWarp,
  MapNpc,
  MapSign,
  MapSignEffect,
  MapReactor,
  MapSpawn,
  MapSpawnFlag,
  MapSpawnGroup,
  CardinalDirection
} from '../data/mapData'
import { escapeXml as esc, attr, childText, parseXmlDocument, HYBRASYL_NS } from './xmlUtils'
import { extractComments, reinjectComments } from './xmlComments'

/**
 * The generic-name annotation, e.g. `<!-- Generic Name: Tagor Tavern -->`.
 *
 * A readable scalar rather than a JSON blob. It matches what the world XML
 * already does for NPCs (`<!-- Location: -->`, `<!-- Comment: -->`), reads
 * correctly to somebody opening the file by hand, and diffs as one line. A
 * `taliesin:meta {...}` blob would earn its complexity only once there is a
 * second field to put in it (HTOO-344).
 */
const GENERIC_NAME_RE = /^\s*Generic Name:\s*(.*?)\s*$/

// ── Parse ─────────────────────────────────────────────────────────────────────

export function parseMapXml(xml: string): MapData {
  const root = parseXmlDocument(xml).documentElement

  // Comments first: they are not in the DOM walk below, and the serializer
  // emits only what the model carries, so anything not captured here is deleted
  // by the next save. The generic-name annotation is pulled out of the same
  // list — it is modelled, so re-injecting it too would duplicate it.
  let genericName: string | undefined
  const comments = extractComments(xml).filter((c) => {
    const m = GENERIC_NAME_RE.exec(c.text)
    if (!m || genericName !== undefined) return true
    genericName = m[1]
    return false
  })

  // Flags — space/comma separated text inside <Flags>
  const flagsText = childText(root, 'Flags')
  const flags: MapFlag[] = flagsText ? (flagsText.split(/[\s,]+/).filter(Boolean) as MapFlag[]) : []

  // Warps
  const warps: MapWarp[] = []
  for (const warpEl of root.querySelectorAll('Warps > Warp')) {
    const mapTargetEl = warpEl.querySelector('MapTarget')
    const worldMapTargetEl = warpEl.querySelector('WorldMapTarget')
    const restrictionsEl = warpEl.querySelector('Restrictions')

    const warp: MapWarp = {
      x: parseInt(attr(warpEl, 'X', '0'), 10),
      y: parseInt(attr(warpEl, 'Y', '0'), 10),
      targetType: mapTargetEl ? 'map' : 'worldmap'
    }
    const desc = warpEl.querySelector('Description')?.textContent?.trim()
    if (desc) warp.description = desc

    if (mapTargetEl) {
      // Name is text content: <MapTarget X="5" Y="10">MapName</MapTarget>
      warp.mapTargetName = mapTargetEl.textContent?.trim() ?? ''
      warp.mapTargetX = parseInt(attr(mapTargetEl, 'X', '0'), 10)
      warp.mapTargetY = parseInt(attr(mapTargetEl, 'Y', '0'), 10)
    }
    if (worldMapTargetEl) {
      warp.worldMapTarget = worldMapTargetEl.textContent?.trim() ?? ''
    }
    if (restrictionsEl) {
      const r: MapWarp['restrictions'] = {}
      if (restrictionsEl.hasAttribute('Level'))
        r.level = parseInt(attr(restrictionsEl, 'Level'), 10)
      if (restrictionsEl.hasAttribute('Ability'))
        r.ability = parseInt(attr(restrictionsEl, 'Ability'), 10)
      if (restrictionsEl.hasAttribute('Ab')) r.ab = parseInt(attr(restrictionsEl, 'Ab'), 10)
      warp.restrictions = r
    }
    warps.push(warp)
  }

  // NPCs
  const npcs: MapNpc[] = []
  for (const npcEl of root.querySelectorAll('Npcs > Npc')) {
    const npc: MapNpc = {
      name: attr(npcEl, 'Name'),
      x: parseInt(attr(npcEl, 'X', '0'), 10),
      y: parseInt(attr(npcEl, 'Y', '0'), 10),
      direction: attr(npcEl, 'Direction', 'South') as CardinalDirection
    }
    const dn = attr(npcEl, 'DisplayName')
    if (dn) npc.displayName = dn
    npcs.push(npc)
  }

  // Signs
  const signs: MapSign[] = []
  for (const signEl of root.querySelectorAll('Signs > Sign')) {
    const sign: MapSign = {
      type: attr(signEl, 'Type', 'Sign'),
      x: parseInt(attr(signEl, 'X', '0'), 10),
      y: parseInt(attr(signEl, 'Y', '0'), 10)
    }
    const bk = attr(signEl, 'BoardKey')
    if (bk) sign.boardKey = bk
    const nm = signEl.querySelector('Name')?.textContent?.trim()
    if (nm) sign.name = nm
    const de = signEl.querySelector('Description')?.textContent?.trim()
    if (de) sign.description = de
    const msg = signEl.querySelector('Message')?.textContent?.trim()
    if (msg) sign.message = msg
    const sc = signEl.querySelector('Script')?.textContent?.trim()
    if (sc) sign.script = sc
    const effectEl = signEl.querySelector('Effect')
    if (effectEl) {
      const effect: MapSignEffect = { onEntry: parseInt(attr(effectEl, 'OnEntry', '0'), 10) }
      if (effectEl.hasAttribute('OnEntrySpeed'))
        effect.onEntrySpeed = parseInt(attr(effectEl, 'OnEntrySpeed', '100'), 10)
      sign.effect = effect
    }
    signs.push(sign)
  }

  // Reactors
  const reactors: MapReactor[] = []
  for (const el of root.querySelectorAll('Reactors > Reactor')) {
    const reactor: MapReactor = {
      x: parseInt(attr(el, 'X', '0'), 10),
      y: parseInt(attr(el, 'Y', '0'), 10)
    }
    const dn = attr(el, 'DisplayName')
    if (dn) reactor.displayName = dn
    const desc = el.querySelector('Description')?.textContent?.trim()
    if (desc) reactor.description = desc
    const sc = el.querySelector('Script')?.textContent?.trim()
    if (sc) reactor.script = sc
    reactors.push(reactor)
  }

  // SpawnGroup (optional, at most one per map)
  let spawnGroup: MapSpawnGroup | undefined
  const sgEl = root.querySelector('SpawnGroup')
  if (sgEl) {
    const spawns: MapSpawn[] = []
    for (const spawnEl of sgEl.querySelectorAll('Spawns > Spawn')) {
      const flagsRaw = attr(spawnEl, 'Flags')
      const flags = flagsRaw ? (flagsRaw.split(/[\s,]+/).filter(Boolean) as MapSpawnFlag[]) : []
      spawns.push({ import: attr(spawnEl, 'Import'), flags })
    }
    spawnGroup = {
      name: attr(sgEl, 'Name'),
      baseLevel: Math.max(1, Math.min(99, parseInt(attr(sgEl, 'BaseLevel', '1'), 10))),
      spawns
    }
  }

  const descText = childText(root, 'Description')

  const musicRaw = attr(root, 'Music')
  const musicNum = musicRaw === '' ? NaN : parseInt(musicRaw, 10)
  const music = Number.isFinite(musicNum) && musicNum >= 1 && musicNum <= 256 ? musicNum : undefined

  return {
    id: parseInt(attr(root, 'Id', '0'), 10),
    name: childText(root, 'Name'),
    music,
    x: parseInt(attr(root, 'X', '40'), 10),
    y: parseInt(attr(root, 'Y', '40'), 10),
    isEnabled: attr(root, 'IsEnabled', 'true') !== 'false',
    allowCasting: attr(root, 'AllowCasting', 'true') !== 'false',
    dynamicLighting: attr(root, 'DynamicLighting', 'false') === 'true',
    description: descText || undefined,
    flags,
    warps,
    npcs,
    signs,
    reactors,
    spawnGroup,
    genericName: genericName || undefined,
    comments: comments.length > 0 ? comments : undefined
  }
}

// ── Serialize ─────────────────────────────────────────────────────────────────

export function serializeMapXml(data: MapData): string {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="utf-8"?>')

  const rootAttrs = [
    `Id="${data.id}"`,
    ...(data.music != null ? [`Music="${data.music}"`] : []),
    `X="${data.x}"`,
    `Y="${data.y}"`,
    `IsEnabled="${data.isEnabled}"`,
    `AllowCasting="${data.allowCasting}"`,
    ...(data.dynamicLighting ? [`DynamicLighting="true"`] : [])
  ].join(' ')

  lines.push(`<Map ${rootAttrs} xmlns="${HYBRASYL_NS}">`)
  // Emitted only when set, so a map without one gains no annotation and its
  // diff after a save stays empty.
  if (data.genericName?.trim()) {
    lines.push(`  <!-- Generic Name: ${data.genericName.trim()} -->`)
  }
  lines.push(`  <Name>${esc(data.name)}</Name>`)
  if (data.description?.trim()) lines.push(`  <Description>${esc(data.description)}</Description>`)
  if (data.flags.length > 0) lines.push(`  <Flags>${data.flags.join(' ')}</Flags>`)

  if (data.warps.length > 0) {
    lines.push('  <Warps>')
    for (const w of data.warps) {
      lines.push(`    <Warp X="${w.x}" Y="${w.y}">`)
      if (w.description?.trim())
        lines.push(`      <Description>${esc(w.description)}</Description>`)
      if (w.targetType === 'map' && w.mapTargetName !== undefined) {
        lines.push(
          `      <MapTarget X="${w.mapTargetX ?? 0}" Y="${w.mapTargetY ?? 0}">${esc(w.mapTargetName)}</MapTarget>`
        )
      }
      if (w.targetType === 'worldmap' && w.worldMapTarget !== undefined) {
        lines.push(`      <WorldMapTarget>${esc(w.worldMapTarget)}</WorldMapTarget>`)
      }
      if (w.restrictions) {
        const rParts: string[] = []
        if (w.restrictions.level !== undefined) rParts.push(`Level="${w.restrictions.level}"`)
        if (w.restrictions.ability !== undefined) rParts.push(`Ability="${w.restrictions.ability}"`)
        if (w.restrictions.ab !== undefined) rParts.push(`Ab="${w.restrictions.ab}"`)
        if (rParts.length > 0) lines.push(`      <Restrictions ${rParts.join(' ')} />`)
      }
      lines.push('    </Warp>')
    }
    lines.push('  </Warps>')
  }

  if (data.npcs.length > 0) {
    lines.push('  <Npcs>')
    for (const n of data.npcs) {
      const parts = [
        `Name="${esc(n.name)}"`,
        `X="${n.x}"`,
        `Y="${n.y}"`,
        `Direction="${n.direction}"`
      ]
      if (n.displayName) parts.push(`DisplayName="${esc(n.displayName)}"`)
      lines.push(`    <Npc ${parts.join(' ')} />`)
    }
    lines.push('  </Npcs>')
  }

  if (data.signs.length > 0) {
    lines.push('  <Signs>')
    for (const s of data.signs) {
      const parts = [`Type="${esc(s.type)}"`, `X="${s.x}"`, `Y="${s.y}"`]
      if (s.boardKey) parts.push(`BoardKey="${esc(s.boardKey)}"`)
      const children: string[] = []
      if (s.name?.trim()) children.push(`      <Name>${esc(s.name)}</Name>`)
      if (s.description?.trim())
        children.push(`      <Description>${esc(s.description)}</Description>`)
      if (s.message?.trim()) children.push(`      <Message>${esc(s.message)}</Message>`)
      if (s.script?.trim()) children.push(`      <Script>${esc(s.script)}</Script>`)
      if (s.effect) {
        const eParts = [`OnEntry="${s.effect.onEntry}"`]
        if (s.effect.onEntrySpeed !== undefined)
          eParts.push(`OnEntrySpeed="${s.effect.onEntrySpeed}"`)
        children.push(`      <Effect ${eParts.join(' ')} />`)
      }
      if (children.length > 0) {
        lines.push(`    <Sign ${parts.join(' ')}>`)
        lines.push(...children)
        lines.push('    </Sign>')
      } else {
        lines.push(`    <Sign ${parts.join(' ')} />`)
      }
    }
    lines.push('  </Signs>')
  }

  const sg = data.spawnGroup
  if (sg && (sg.name || sg.spawns.length > 0)) {
    lines.push(`  <SpawnGroup Name="${esc(sg.name)}" BaseLevel="${sg.baseLevel}">`)
    if (sg.spawns.length > 0) {
      lines.push('    <Spawns>')
      for (const s of sg.spawns) {
        const parts = [`Import="${esc(s.import)}"`]
        if (s.flags.length > 0) parts.push(`Flags="${s.flags.join(' ')}"`)
        lines.push(`      <Spawn ${parts.join(' ')} />`)
      }
      lines.push('    </Spawns>')
    }
    lines.push('  </SpawnGroup>')
  }

  if (data.reactors.length > 0) {
    lines.push('  <Reactors>')
    for (const r of data.reactors) {
      const parts = [`X="${r.x}"`, `Y="${r.y}"`]
      if (r.displayName) parts.push(`DisplayName="${esc(r.displayName)}"`)
      const children: string[] = []
      if (r.description?.trim())
        children.push(`      <Description>${esc(r.description)}</Description>`)
      if (r.script?.trim()) children.push(`      <Script>${esc(r.script)}</Script>`)
      if (children.length > 0) {
        lines.push(`    <Reactor ${parts.join(' ')}>`)
        lines.push(...children)
        lines.push('    </Reactor>')
      } else {
        lines.push(`    <Reactor ${parts.join(' ')} />`)
      }
    }
    lines.push('  </Reactors>')
  }

  lines.push('</Map>')
  // Last, over the finished text: comments are addressed by where they sat
  // among their container's element children, so every element has to be
  // emitted before any of them can be placed. See utils/xmlComments.ts.
  return reinjectComments(lines.join('\n'), data.comments ?? [])
}
