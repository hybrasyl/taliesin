import { describe, it, expect } from 'vitest'
import { parseMapXml, serializeMapXml } from '../mapXml'
import type { MapData } from '../../data/mapData'

const MINIMAL: MapData = {
  id: 0,
  name: '',
  music: 0,
  x: 40,
  y: 40,
  isEnabled: true,
  allowCasting: true,
  dynamicLighting: false,
  flags: [],
  warps: [],
  npcs: [],
  signs: [],
  reactors: [],
}

function build(overrides: Partial<MapData>): MapData {
  return { ...MINIMAL, ...overrides }
}

describe('parseMapXml', () => {
  it('parses root attributes with defaults when missing', () => {
    const data = parseMapXml('<Map><Name>Test</Name></Map>')
    expect(data.id).toBe(0)
    expect(data.name).toBe('Test')
    expect(data.music).toBe(0)
    expect(data.x).toBe(40)
    expect(data.y).toBe(40)
    expect(data.isEnabled).toBe(true)
    expect(data.allowCasting).toBe(true)
    expect(data.dynamicLighting).toBe(false)
  })

  it('parses explicit root attributes', () => {
    const xml = `<Map Id="500" Music="3" X="80" Y="60" IsEnabled="false" AllowCasting="false" DynamicLighting="true">
      <Name>Hybrasyl</Name>
      <Description>The capital</Description>
    </Map>`
    const data = parseMapXml(xml)
    expect(data.id).toBe(500)
    expect(data.music).toBe(3)
    expect(data.x).toBe(80)
    expect(data.y).toBe(60)
    expect(data.isEnabled).toBe(false)
    expect(data.allowCasting).toBe(false)
    expect(data.dynamicLighting).toBe(true)
    expect(data.description).toBe('The capital')
  })

  it('strips xmlns declarations so querySelectorAll works', () => {
    const xml = `<Map xmlns="http://www.hybrasyl.com/XML/Hybrasyl/2020-02"><Name>NS</Name></Map>`
    const data = parseMapXml(xml)
    expect(data.name).toBe('NS')
  })

  it('parses flags from space- or comma-separated text', () => {
    const a = parseMapXml('<Map><Flags>Snow Rain Dark</Flags></Map>')
    expect(a.flags).toEqual(['Snow', 'Rain', 'Dark'])
    const b = parseMapXml('<Map><Flags>Snow,Rain, Dark</Flags></Map>')
    expect(b.flags).toEqual(['Snow', 'Rain', 'Dark'])
  })

  it('parses a map-target warp with restrictions', () => {
    const xml = `<Map><Warps>
      <Warp X="3" Y="4">
        <Description>Door</Description>
        <MapTarget X="10" Y="20">Inn</MapTarget>
        <Restrictions Level="5" Ability="2" Ab="1" />
      </Warp>
    </Warps></Map>`
    const data = parseMapXml(xml)
    expect(data.warps).toHaveLength(1)
    const w = data.warps[0]
    expect(w.x).toBe(3)
    expect(w.y).toBe(4)
    expect(w.targetType).toBe('map')
    expect(w.mapTargetName).toBe('Inn')
    expect(w.mapTargetX).toBe(10)
    expect(w.mapTargetY).toBe(20)
    expect(w.description).toBe('Door')
    expect(w.restrictions).toEqual({ level: 5, ability: 2, ab: 1 })
  })

  it('parses a worldmap-target warp', () => {
    const xml = `<Map><Warps>
      <Warp X="1" Y="2"><WorldMapTarget>Mileth</WorldMapTarget></Warp>
    </Warps></Map>`
    const data = parseMapXml(xml)
    expect(data.warps[0].targetType).toBe('worldmap')
    expect(data.warps[0].worldMapTarget).toBe('Mileth')
    expect(data.warps[0].mapTargetName).toBeUndefined()
  })

  it('parses NPCs with optional displayName', () => {
    const xml = `<Map><Npcs>
      <Npc Name="merchant" X="5" Y="6" Direction="North" DisplayName="Bob the Merchant" />
      <Npc Name="guard" X="7" Y="8" />
    </Npcs></Map>`
    const data = parseMapXml(xml)
    expect(data.npcs).toEqual([
      { name: 'merchant', x: 5, y: 6, direction: 'North', displayName: 'Bob the Merchant' },
      { name: 'guard', x: 7, y: 8, direction: 'South' },
    ])
  })

  it('parses signs with effect and message', () => {
    const xml = `<Map><Signs>
      <Sign Type="Signpost" X="2" Y="3" BoardKey="welcome">
        <Name>Welcome</Name>
        <Description>A sign</Description>
        <Message>Hello adventurer</Message>
        <Script>greet</Script>
        <Effect OnEntry="42" OnEntrySpeed="200" />
      </Sign>
      <Sign Type="MessageBoard" X="4" Y="5" />
    </Signs></Map>`
    const data = parseMapXml(xml)
    expect(data.signs).toHaveLength(2)
    expect(data.signs[0]).toEqual({
      type: 'Signpost', x: 2, y: 3, boardKey: 'welcome',
      name: 'Welcome', description: 'A sign', message: 'Hello adventurer', script: 'greet',
      effect: { onEntry: 42, onEntrySpeed: 200 },
    })
    expect(data.signs[1]).toEqual({ type: 'MessageBoard', x: 4, y: 5 })
  })

  it('parses reactors', () => {
    const xml = `<Map><Reactors>
      <Reactor X="9" Y="10" DisplayName="Trap"><Description>Watch out</Description><Script>spike</Script></Reactor>
    </Reactors></Map>`
    const data = parseMapXml(xml)
    expect(data.reactors).toEqual([{
      x: 9, y: 10, displayName: 'Trap', description: 'Watch out', script: 'spike',
    }])
  })

  it('parses spawn group with flags', () => {
    const xml = `<Map><SpawnGroup Name="goblins" BaseLevel="5">
      <Spawns>
        <Spawn Import="goblin" Flags="Active MovementDisabled" />
        <Spawn Import="hobgoblin" />
      </Spawns>
    </SpawnGroup></Map>`
    const data = parseMapXml(xml)
    expect(data.spawnGroup).toEqual({
      name: 'goblins', baseLevel: 5,
      spawns: [
        { import: 'goblin', flags: ['Active', 'MovementDisabled'] },
        { import: 'hobgoblin', flags: [] },
      ],
    })
  })

  it('clamps spawn group baseLevel to 1..99', () => {
    const a = parseMapXml('<Map><SpawnGroup Name="x" BaseLevel="0"></SpawnGroup></Map>')
    expect(a.spawnGroup?.baseLevel).toBe(1)
    const b = parseMapXml('<Map><SpawnGroup Name="x" BaseLevel="500"></SpawnGroup></Map>')
    expect(b.spawnGroup?.baseLevel).toBe(99)
  })

  it('returns sensible defaults for an empty map element', () => {
    // The renderer relies on Chromium's DOMParser to surface parsererror nodes;
    // jsdom is more lenient. We assert the degraded-data path instead.
    const data = parseMapXml('<Map></Map>')
    expect(data.id).toBe(0)
    expect(data.name).toBe('')
    expect(data.flags).toEqual([])
    expect(data.warps).toEqual([])
    expect(data.npcs).toEqual([])
  })
})

describe('serializeMapXml', () => {
  it('serializes minimal map', () => {
    const xml = serializeMapXml(build({ name: 'Test' }))
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>')
    expect(xml).toContain('<Map Id="0" Music="0" X="40" Y="40" IsEnabled="true" AllowCasting="true">')
    expect(xml).toContain('<Name>Test</Name>')
    expect(xml).not.toContain('DynamicLighting')
    expect(xml).not.toContain('<Warps>')
  })

  it('emits DynamicLighting only when true', () => {
    expect(serializeMapXml(build({ dynamicLighting: false }))).not.toContain('DynamicLighting')
    expect(serializeMapXml(build({ dynamicLighting: true }))).toContain('DynamicLighting="true"')
  })

  it('escapes XML special characters in text and attributes', () => {
    const xml = serializeMapXml(build({
      name: 'A & <B>',
      description: 'has "quotes"',
      npcs: [{ name: 'a"b', x: 0, y: 0, direction: 'South', displayName: '<x>' }],
    }))
    expect(xml).toContain('<Name>A &amp; &lt;B&gt;</Name>')
    expect(xml).toContain('has &quot;quotes&quot;')
    expect(xml).toContain('Name="a&quot;b"')
    expect(xml).toContain('DisplayName="&lt;x&gt;"')
  })
})

describe('round-trip parse → serialize → parse', () => {
  it('preserves a fully-populated map', () => {
    const original: MapData = {
      id: 1234,
      name: 'Full Map',
      music: 7,
      x: 100, y: 80,
      isEnabled: false,
      allowCasting: false,
      dynamicLighting: true,
      description: 'A description',
      flags: ['Snow', 'Dark'],
      warps: [
        { x: 1, y: 2, targetType: 'map', mapTargetName: 'Inn', mapTargetX: 5, mapTargetY: 6, description: 'door',
          restrictions: { level: 10, ability: 2, ab: 1 } },
        { x: 3, y: 4, targetType: 'worldmap', worldMapTarget: 'Mileth' },
      ],
      npcs: [{ name: 'bob', x: 9, y: 9, direction: 'North', displayName: 'Bob' }],
      signs: [{
        type: 'Signpost', x: 7, y: 8, boardKey: 'k', name: 'N', description: 'D', message: 'M', script: 'S',
        effect: { onEntry: 1, onEntrySpeed: 50 },
      }],
      reactors: [{ x: 12, y: 13, displayName: 'R', description: 'rd', script: 'rs' }],
      spawnGroup: {
        name: 'g', baseLevel: 12,
        spawns: [{ import: 'goblin', flags: ['Active'] }],
      },
    }

    const reparsed = parseMapXml(serializeMapXml(original))
    expect(reparsed).toEqual(original)
  })

  it('preserves a minimal map (round-trip equality on empty arrays)', () => {
    const reparsed = parseMapXml(serializeMapXml(build({ name: 'Tiny' })))
    expect(reparsed.name).toBe('Tiny')
    expect(reparsed.warps).toEqual([])
    expect(reparsed.npcs).toEqual([])
    expect(reparsed.signs).toEqual([])
    expect(reparsed.reactors).toEqual([])
    expect(reparsed.flags).toEqual([])
    expect(reparsed.spawnGroup).toBeUndefined()
  })
})
