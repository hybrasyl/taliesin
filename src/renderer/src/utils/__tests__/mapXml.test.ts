import { describe, it, expect } from 'vitest'
import { parseMapXml, serializeMapXml } from '../mapXml'
import { HYBRASYL_NS } from '../xmlUtils'
import type { MapData } from '../../data/mapData'

const MINIMAL: MapData = {
  id: 0,
  name: '',
  x: 40,
  y: 40,
  isEnabled: true,
  allowCasting: true,
  dynamicLighting: false,
  flags: [],
  warps: [],
  npcs: [],
  signs: [],
  reactors: []
}

function build(overrides: Partial<MapData>): MapData {
  return { ...MINIMAL, ...overrides }
}

describe('parseMapXml', () => {
  it('parses root attributes with defaults when missing', () => {
    const data = parseMapXml('<Map><Name>Test</Name></Map>')
    expect(data.id).toBe(0)
    expect(data.name).toBe('Test')
    expect(data.music).toBeUndefined()
    expect(data.x).toBe(40)
    expect(data.y).toBe(40)
    expect(data.isEnabled).toBe(true)
    expect(data.allowCasting).toBe(true)
    expect(data.dynamicLighting).toBe(false)
  })

  it('treats Music="0" as no music (undefined) for back-compat', () => {
    const data = parseMapXml('<Map Music="0"><Name>X</Name></Map>')
    expect(data.music).toBeUndefined()
  })

  it('treats out-of-range or non-numeric Music as undefined', () => {
    expect(parseMapXml('<Map Music="-1"></Map>').music).toBeUndefined()
    expect(parseMapXml('<Map Music="257"></Map>').music).toBeUndefined()
    expect(parseMapXml('<Map Music="abc"></Map>').music).toBeUndefined()
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
      { name: 'guard', x: 7, y: 8, direction: 'South' }
    ])
  })

  it('parses signs with effect and message', () => {
    const xml = `<Map><Signs>
      <Sign Type="Sign" X="2" Y="3" BoardKey="welcome">
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
      type: 'Sign',
      x: 2,
      y: 3,
      boardKey: 'welcome',
      name: 'Welcome',
      description: 'A sign',
      message: 'Hello adventurer',
      script: 'greet',
      effect: { onEntry: 42, onEntrySpeed: 200 }
    })
    expect(data.signs[1]).toEqual({ type: 'MessageBoard', x: 4, y: 5 })
  })

  it('parses reactors', () => {
    const xml = `<Map><Reactors>
      <Reactor X="9" Y="10" DisplayName="Trap"><Description>Watch out</Description><Script>spike</Script></Reactor>
    </Reactors></Map>`
    const data = parseMapXml(xml)
    expect(data.reactors).toEqual([
      {
        x: 9,
        y: 10,
        displayName: 'Trap',
        description: 'Watch out',
        script: 'spike'
      }
    ])
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
      name: 'goblins',
      baseLevel: 5,
      spawns: [
        { import: 'goblin', flags: ['Active', 'MovementDisabled'] },
        { import: 'hobgoblin', flags: [] }
      ]
    })
  })

  it('clamps spawn group baseLevel to 1..99', () => {
    const a = parseMapXml('<Map><SpawnGroup Name="x" BaseLevel="0"></SpawnGroup></Map>')
    expect(a.spawnGroup?.baseLevel).toBe(1)
    const b = parseMapXml('<Map><SpawnGroup Name="x" BaseLevel="500"></SpawnGroup></Map>')
    expect(b.spawnGroup?.baseLevel).toBe(99)
  })

  it('returns sensible defaults for a well-formed but empty Map element', () => {
    const data = parseMapXml('<Map></Map>')
    expect(data.id).toBe(0)
    expect(data.name).toBe('')
    expect(data.flags).toEqual([])
    expect(data.warps).toEqual([])
    expect(data.npcs).toEqual([])
  })

  it('throws on truly malformed XML (parsererror documentElement)', () => {
    expect(() => parseMapXml('<Map><Name>foo</Map>')).toThrow(/XML parse error/)
    expect(() => parseMapXml('<<<>>')).toThrow(/XML parse error/)
    expect(() => parseMapXml('')).toThrow(/XML parse error/)
  })
})

describe('serializeMapXml', () => {
  it('serializes minimal map without Music attribute when unset', () => {
    const xml = serializeMapXml(build({ name: 'Test' }))
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>')
    expect(xml).toContain(
      `<Map Id="0" X="40" Y="40" IsEnabled="true" AllowCasting="true" xmlns="${HYBRASYL_NS}">`
    )
    expect(xml).not.toContain('Music=')
    expect(xml).toContain('<Name>Test</Name>')
    expect(xml).not.toContain('DynamicLighting')
    expect(xml).not.toContain('<Warps>')
  })

  it('emits Music attribute when set', () => {
    expect(serializeMapXml(build({ music: 42 }))).toContain('Music="42"')
  })

  it('emits DynamicLighting only when true', () => {
    expect(serializeMapXml(build({ dynamicLighting: false }))).not.toContain('DynamicLighting')
    expect(serializeMapXml(build({ dynamicLighting: true }))).toContain('DynamicLighting="true"')
  })

  it('escapes XML special characters in text and attributes', () => {
    const xml = serializeMapXml(
      build({
        name: 'A & <B>',
        description: 'has "quotes"',
        npcs: [{ name: 'a"b', x: 0, y: 0, direction: 'South', displayName: '<x>' }]
      })
    )
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
      x: 100,
      y: 80,
      isEnabled: false,
      allowCasting: false,
      dynamicLighting: true,
      description: 'A description',
      flags: ['Snow', 'Dark'],
      warps: [
        {
          x: 1,
          y: 2,
          targetType: 'map',
          mapTargetName: 'Inn',
          mapTargetX: 5,
          mapTargetY: 6,
          description: 'door',
          restrictions: { level: 10, ability: 2, ab: 1 }
        },
        { x: 3, y: 4, targetType: 'worldmap', worldMapTarget: 'Mileth' }
      ],
      npcs: [{ name: 'bob', x: 9, y: 9, direction: 'North', displayName: 'Bob' }],
      signs: [
        {
          type: 'Sign',
          x: 7,
          y: 8,
          boardKey: 'k',
          name: 'N',
          description: 'D',
          message: 'M',
          script: 'S',
          effect: { onEntry: 1, onEntrySpeed: 50 }
        }
      ],
      reactors: [{ x: 12, y: 13, displayName: 'R', description: 'rd', script: 'rs' }],
      spawnGroup: {
        name: 'g',
        baseLevel: 12,
        spawns: [{ import: 'goblin', flags: ['Active'] }]
      }
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

// These assert the serialized STRING, not a re-parsed object. Every round-trip
// test above is blind to a missing namespace by construction: parseXmlDocument
// strips xmlns before parsing, so a serializer that omits it round-trips
// perfectly while emitting a document the server refuses at (2, 2).
describe('serializeMapXml — output well-formedness', () => {
  it('writes the Hybrasyl default namespace on the root element', () => {
    expect(serializeMapXml(build({ name: 'NS' }))).toContain(`xmlns="${HYBRASYL_NS}"`)
  })

  it('puts the namespace back on a map that was read with it stripped', () => {
    // The regression that produced 37 broken files in `world`: open a valid
    // existing map, change nothing, save. Writing a NEW map is not this case.
    const onDisk = `<?xml version="1.0" encoding="utf-8"?>
<Map xmlns="${HYBRASYL_NS}" Id="30905" Name="Tagor Trader" X="10" Y="10"><Name>Tagor Trader</Name></Map>`
    const resaved = serializeMapXml(parseMapXml(onDisk))
    expect(resaved).toContain(`xmlns="${HYBRASYL_NS}"`)
  })

  it('declares the namespace exactly once, on the root', () => {
    const xml = serializeMapXml(build({ name: 'Once', signs: [{ type: 'Sign', x: 1, y: 1 }] }))
    expect(xml.match(/xmlns=/g)).toHaveLength(1)
    expect(xml.split('\n')[1]).toContain('xmlns=')
  })

  it('never writes Signpost, which the server enum has no member for', () => {
    const xml = serializeMapXml(build({ signs: [{ type: 'Sign', x: 2, y: 3 }] }))
    expect(xml).toContain('Type="Sign"')
    expect(xml).not.toContain('Signpost')
  })

  it('defaults a Type-less sign to Sign rather than Signpost on read', () => {
    const data = parseMapXml('<Map><Signs><Sign X="1" Y="1" /></Signs></Map>')
    expect(data.signs[0].type).toBe('Sign')
  })
})

// ── Comments and the generic name (HTOO-344) ─────────────────────────────────

describe('comment round trip', () => {
  // The shape of a real production map: the note sits inside <Spawns>, beside
  // the spawn it is about. Taliesin used to delete it on the first save.
  const withNote = `<?xml version="1.0" encoding="utf-8"?>
<Map Id="1" X="40" Y="40" IsEnabled="true" AllowCasting="true" xmlns="http://www.hybrasyl.com/XML/Hybrasyl/2020-02">
  <Name>Dubhaim Castle East</Name>
  <SpawnGroup Name="DubCastleEast4-2" BaseLevel="1">
    <Spawns>
      <!-- Needs new spawn group possibly after revamp -->
      <Spawn Import="DubEast4-1" Flags="Active" />
    </Spawns>
  </SpawnGroup>
</Map>`

  it('captures a hand-written note onto the model', () => {
    const data = parseMapXml(withNote)
    expect(data.comments).toHaveLength(1)
    expect(data.comments?.[0].text).toContain('Needs new spawn group')
  })

  it('writes the note back beside the spawn it describes', () => {
    const out = serializeMapXml(parseMapXml(withNote))
    expect(out).toContain(
      '      <!-- Needs new spawn group possibly after revamp -->\n      <Spawn Import="DubEast4-1" Flags="Active" />'
    )
  })

  it('survives a second round trip unchanged', () => {
    const once = serializeMapXml(parseMapXml(withNote))
    expect(serializeMapXml(parseMapXml(once))).toBe(once)
  })

  it('invents no annotation for a map that had none', () => {
    const plain = `<?xml version="1.0" encoding="utf-8"?>
<Map Id="1" X="40" Y="40" IsEnabled="true" AllowCasting="true" xmlns="http://www.hybrasyl.com/XML/Hybrasyl/2020-02">
  <Name>Plain</Name>
</Map>`
    expect(serializeMapXml(parseMapXml(plain))).not.toContain('<!--')
  })
})

describe('generic name', () => {
  const tagor = `<?xml version="1.0" encoding="utf-8"?>
<Map Id="30909" X="40" Y="40" IsEnabled="true" AllowCasting="true" xmlns="http://www.hybrasyl.com/XML/Hybrasyl/2020-02">
  <!-- Generic Name: Tagor Tavern -->
  <Name>The Crow &amp; Cask</Name>
</Map>`

  it('reads the annotation into its own field, not into Name', () => {
    const data = parseMapXml(tagor)
    expect(data.genericName).toBe('Tagor Tavern')
    expect(data.name).toBe('The Crow & Cask')
  })

  // It is modelled, so it must not also come back as an unknown comment —
  // that would emit it twice.
  it('is not also carried as a preserved comment', () => {
    expect(parseMapXml(tagor).comments).toBeUndefined()
  })

  it('round-trips without duplicating itself', () => {
    const out = serializeMapXml(parseMapXml(tagor))
    expect(out.match(/Generic Name:/g)).toHaveLength(1)
    expect(parseMapXml(out).genericName).toBe('Tagor Tavern')
  })

  it('emits nothing when it is blank', () => {
    const data = { ...parseMapXml(tagor), genericName: '  ' }
    expect(serializeMapXml(data)).not.toContain('Generic Name')
  })
})
