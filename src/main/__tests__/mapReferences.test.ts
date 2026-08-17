import { describe, it, expect } from 'vitest'
import {
  countReferencesTo,
  decodeXmlText,
  encodeXmlText,
  referencedNames,
  rewriteReferences,
  MAP_REFERENCE_SECTIONS,
  type ReferenceRule
} from '../mapReferences'

/** The rules for a section, by name — the table is the source of truth. */
function rulesFor(section: string): ReferenceRule[] {
  const found = MAP_REFERENCE_SECTIONS.find((s) => s.section === section)
  if (!found) throw new Error(`no rules for ${section}`)
  return found.rules
}

const MAPS = rulesFor('maps')

// HTOO-347. A warp stores its destination as a name string and resolves it at
// traverse time, so renaming a map breaks every inbound warp — silently, and in
// other files.

describe('decodeXmlText', () => {
  it('decodes the named entities', () => {
    expect(decodeXmlText('The Crow &amp; Cask')).toBe('The Crow & Cask')
    expect(decodeXmlText('&lt;a&gt; &quot;b&quot; &apos;c&apos;')).toBe(`<a> "b" 'c'`)
  })

  it('decodes numeric references', () => {
    expect(decodeXmlText('&#65;&#x42;')).toBe('AB')
  })

  // One pass, deliberately: `&amp;amp;` means the literal `&amp;`, which is
  // what the server would look up. A double-escaped target is broken
  // (HTOO-343), not a referrer this pass should quietly repair.
  it('decodes a double-escaped value only once', () => {
    expect(decodeXmlText('The Crow &amp;amp; Cask')).toBe('The Crow &amp; Cask')
  })

  it('leaves an unknown entity alone rather than mangling it', () => {
    expect(decodeXmlText('a &nbsp; b')).toBe('a &nbsp; b')
  })
})

describe('encodeXmlText', () => {
  it('escapes what element text must escape', () => {
    expect(encodeXmlText('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
  })

  it('round-trips with the decoder', () => {
    const name = 'The Crow & Cask <best> "inn"'
    expect(decodeXmlText(encodeXmlText(name))).toBe(name)
  })
})

const XML = `<?xml version="1.0"?>
<Map Id="1">
  <Name>Somewhere</Name>
  <Warps>
    <Warp X="1" Y="1">
      <MapTarget X="5" Y="5">The Crow &amp; Cask</MapTarget>
    </Warp>
    <Warp X="2" Y="2">
      <MapTarget X="6" Y="6">Piet Inn</MapTarget>
    </Warp>
    <Warp X="3" Y="3">
      <WorldMapTarget>Temuair</WorldMapTarget>
    </Warp>
  </Warps>
  <Signs>
    <Sign X="9" Y="9">
      <Name>The Crow &amp; Cask</Name>
    </Sign>
  </Signs>
</Map>`

describe('mapTargets', () => {
  it('reads the decoded value of every MapTarget', () => {
    expect(referencedNames(XML, MAPS)).toEqual(['The Crow & Cask', 'Piet Inn'])
  })

  it('ignores a WorldMapTarget, which resolves against something else', () => {
    expect(referencedNames(XML, MAPS)).not.toContain('Temuair')
  })
})

describe('countWarpsTo', () => {
  // The reason the comparison is on decoded values: a raw-text search for
  // "The Crow & Cask" finds nothing and reports a clean result, which reads as
  // "nothing to update" rather than "the search was wrong".
  it('finds a referrer whose name is escaped in the file', () => {
    expect(countReferencesTo(XML, 'The Crow & Cask', MAPS)).toBe(1)
  })

  it('does not count a Sign whose text happens to match', () => {
    // Two elements hold the string; only the MapTarget resolves.
    expect(XML.match(/The Crow &amp; Cask/g)).toHaveLength(2)
    expect(countReferencesTo(XML, 'The Crow & Cask', MAPS)).toBe(1)
  })

  it('counts every warp, not every file', () => {
    const twice = XML.replace(
      '<MapTarget X="6" Y="6">Piet Inn</MapTarget>',
      '<MapTarget X="6" Y="6">The Crow &amp; Cask</MapTarget>'
    )
    expect(countReferencesTo(twice, 'The Crow & Cask', MAPS)).toBe(2)
  })

  it('is case-sensitive, like the server lookup', () => {
    expect(countReferencesTo(XML, 'piet inn', MAPS)).toBe(0)
  })

  it('counts nothing for a blank name', () => {
    expect(countReferencesTo(XML, '   ', MAPS)).toBe(0)
  })

  it('ignores surrounding whitespace in the stored value', () => {
    expect(
      countReferencesTo('<MapTarget X="0" Y="0">\n  Piet Inn\n</MapTarget>', 'Piet Inn', MAPS)
    ).toBe(1)
  })
})

describe('rewriteWarpTargets', () => {
  it('repoints only the matching targets, and reports how many', () => {
    const { xml, changed } = rewriteReferences(XML, 'The Crow & Cask', 'The Tagor Tavern', MAPS)
    expect(changed).toBe(1)
    expect(xml).toContain('<MapTarget X="5" Y="5">The Tagor Tavern</MapTarget>')
    expect(xml).toContain('<MapTarget X="6" Y="6">Piet Inn</MapTarget>')
  })

  it('leaves the Sign alone', () => {
    const { xml } = rewriteReferences(XML, 'The Crow & Cask', 'Tagor Tavern', MAPS)
    expect(xml).toContain('<Name>The Crow &amp; Cask</Name>')
  })

  it('escapes the new name on the way in', () => {
    const { xml } = rewriteReferences(XML, 'Piet Inn', 'Bar & Grill', MAPS)
    expect(xml).toContain('<MapTarget X="6" Y="6">Bar &amp; Grill</MapTarget>')
    expect(countReferencesTo(xml, 'Bar & Grill', MAPS)).toBe(1)
  })

  // A 40-file update should produce 40 one-line diffs, not 40 reformatted files.
  it('changes nothing else in the document', () => {
    const { xml } = rewriteReferences(XML, 'Piet Inn', 'Piet Tavern', MAPS)
    expect(xml).toBe(XML.replace('>Piet Inn<', '>Piet Tavern<'))
  })

  it('is a no-op when nothing matches', () => {
    const { xml, changed } = rewriteReferences(XML, 'Nowhere', 'Somewhere Else', MAPS)
    expect(changed).toBe(0)
    expect(xml).toBe(XML)
  })

  it('is a no-op when the name has not actually changed', () => {
    const { xml, changed } = rewriteReferences(XML, 'Piet Inn', ' Piet Inn ', MAPS)
    expect(changed).toBe(0)
    expect(xml).toBe(XML)
  })

  it('is a no-op for a blank old name', () => {
    expect(rewriteReferences(XML, '', 'X', MAPS)).toEqual({ xml: XML, changed: 0 })
  })
})

// ── The sections beyond maps ─────────────────────────────────────────────────
//
// Warps were the first of these and for a while the only one handled, so a
// rename quietly broke a nation's spawn points, a server config's death map and
// start maps, and a world map's travel points. Each of these is one of those.

describe('nations', () => {
  const NATIONS = rulesFor('nations')
  const XML = `<Nation Flag="4">
  <Name>Mileth</Name>
  <Description>A pasture near Mileth Inn</Description>
  <SpawnPoints>
    <SpawnPoint X="4" Y="8" MapName="Mileth Inn"/>
    <SpawnPoint X="5" Y="8" MapName="Mileth Inn"/>
  </SpawnPoints>
  <Territory>
    <Map Name="Mileth Inn"/>
    <Map Name='Mileth Village Way'/>
  </Territory>
</Nation>`

  it('counts the spawn points and the territory entries', () => {
    expect(countReferencesTo(XML, 'Mileth Inn', NATIONS)).toBe(3)
  })

  it('leaves the nation name and its description alone', () => {
    // `Mileth` is the nation. The description merely mentions a map.
    expect(countReferencesTo(XML, 'Mileth', NATIONS)).toBe(0)
    const { xml } = rewriteReferences(XML, 'Mileth Inn', 'Mileth Tavern', NATIONS)
    expect(xml).toContain('<Description>A pasture near Mileth Inn</Description>')
  })

  it('repoints every one of them', () => {
    const { xml, changed } = rewriteReferences(XML, 'Mileth Inn', 'Mileth Tavern', NATIONS)
    expect(changed).toBe(3)
    expect(countReferencesTo(xml, 'Mileth Tavern', NATIONS)).toBe(3)
    expect(countReferencesTo(xml, 'Mileth Inn', NATIONS)).toBe(0)
  })

  it('keeps the quote the author used', () => {
    const { xml } = rewriteReferences(XML, 'Mileth Village Way', 'Mileth Way', NATIONS)
    expect(xml).toContain(`<Map Name='Mileth Way'/>`)
    expect(xml).toContain(`<SpawnPoint X="4" Y="8" MapName="Mileth Inn"/>`)
  })

  it('escapes for the quote it is writing into', () => {
    const single = `<Territory><Map Name='Old'/></Territory>`
    expect(rewriteReferences(single, 'Old', "Bob's Bar", NATIONS).xml).toContain(
      `Name='Bob&apos;s Bar'`
    )
    const dbl = `<Territory><Map Name="Old"/></Territory>`
    expect(rewriteReferences(dbl, 'Old', 'The "Best" Inn', NATIONS).xml).toContain(
      `Name="The &quot;Best&quot; Inn"`
    )
  })

  it('matches a decoded attribute value', () => {
    const amp = `<SpawnPoints><SpawnPoint X="1" Y="1" MapName="The Crow &amp; Cask"/></SpawnPoints>`
    expect(countReferencesTo(amp, 'The Crow & Cask', NATIONS)).toBe(1)
  })
})

describe('server configs', () => {
  const CONFIG = rulesFor('serverconfigs')
  const XML = `<ServerConfig>
  <Handlers>
    <Death Active="true">
      <Map X="5" Y="5">Chaotic Threshold</Map>
      <Coma Timeout="30">Coma</Coma>
    </Death>
    <NewPlayer>
      <StartMaps>
        <StartMap X="2" Y="3">Mileth Inn Room 1</StartMap>
        <StartMap X="2" Y="3">Mileth Inn Room 2</StartMap>
      </StartMaps>
    </NewPlayer>
  </Handlers>
</ServerConfig>`

  it('counts the death map', () => {
    expect(countReferencesTo(XML, 'Chaotic Threshold', CONFIG)).toBe(1)
  })

  it('counts a start map', () => {
    expect(countReferencesTo(XML, 'Mileth Inn Room 2', CONFIG)).toBe(1)
  })

  it('repoints the death map and keeps its coordinates', () => {
    const { xml, changed } = rewriteReferences(XML, 'Chaotic Threshold', 'The Void', CONFIG)
    expect(changed).toBe(1)
    expect(xml).toContain('<Map X="5" Y="5">The Void</Map>')
  })

  it('leaves the coma, which is not a map', () => {
    const { xml } = rewriteReferences(XML, 'Coma', 'Nap', CONFIG)
    expect(xml).toContain('<Coma Timeout="30">Coma</Coma>')
  })
})

describe('world maps', () => {
  const WORLDMAPS = rulesFor('worldmaps')
  const XML = `<WorldMap ClientMap="field001">
  <Name>Master Map Set</Name>
  <Points>
    <Point X="241" Y="84">
      <Name>Mileth</Name>
      <Target X="14" Y="7">Mileth Village Way</Target>
    </Point>
  </Points>
</WorldMap>`

  it('counts the target a point travels to', () => {
    expect(countReferencesTo(XML, 'Mileth Village Way', WORLDMAPS)).toBe(1)
  })

  it("leaves the point's own label, which the player reads", () => {
    // `<Name>Mileth</Name>` is the word on the world map, not a destination.
    expect(countReferencesTo(XML, 'Mileth', WORLDMAPS)).toBe(0)
    const { xml } = rewriteReferences(XML, 'Mileth', 'Anything', WORLDMAPS)
    expect(xml).toContain('<Name>Mileth</Name>')
  })

  it('repoints the target and keeps its arrival tile', () => {
    const { xml, changed } = rewriteReferences(XML, 'Mileth Village Way', 'Mileth Way', WORLDMAPS)
    expect(changed).toBe(1)
    expect(xml).toContain('<Target X="14" Y="7">Mileth Way</Target>')
  })
})

describe('the section table', () => {
  it('covers every section the XSDs say names a map', () => {
    expect(MAP_REFERENCE_SECTIONS.map((s) => s.section)).toEqual([
      'maps',
      'nations',
      'serverconfigs',
      'worldmaps'
    ])
  })

  it('reads `Map` as an element in one section and an attribute in another', () => {
    // The trap that makes the rules per-section: `<Map>name</Map>` in a server
    // config, `<Map Name="…"/>` in a nation. One global rule cannot be both.
    const config = `<Death><Map X="1" Y="1">Somewhere</Map></Death>`
    const nation = `<Territory><Map Name="Somewhere"/></Territory>`
    expect(countReferencesTo(config, 'Somewhere', rulesFor('serverconfigs'))).toBe(1)
    expect(countReferencesTo(config, 'Somewhere', rulesFor('nations'))).toBe(0)
    expect(countReferencesTo(nation, 'Somewhere', rulesFor('nations'))).toBe(1)
    expect(countReferencesTo(nation, 'Somewhere', rulesFor('serverconfigs'))).toBe(0)
  })
})
