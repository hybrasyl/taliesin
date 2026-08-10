import { describe, it, expect } from 'vitest'
import {
  countWarpsTo,
  decodeXmlText,
  encodeXmlText,
  mapTargets,
  rewriteWarpTargets
} from '../warpTargets'

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
    expect(mapTargets(XML)).toEqual(['The Crow & Cask', 'Piet Inn'])
  })

  it('ignores a WorldMapTarget, which resolves against something else', () => {
    expect(mapTargets(XML)).not.toContain('Temuair')
  })
})

describe('countWarpsTo', () => {
  // The reason the comparison is on decoded values: a raw-text search for
  // "The Crow & Cask" finds nothing and reports a clean result, which reads as
  // "nothing to update" rather than "the search was wrong".
  it('finds a referrer whose name is escaped in the file', () => {
    expect(countWarpsTo(XML, 'The Crow & Cask')).toBe(1)
  })

  it('does not count a Sign whose text happens to match', () => {
    // Two elements hold the string; only the MapTarget resolves.
    expect(XML.match(/The Crow &amp; Cask/g)).toHaveLength(2)
    expect(countWarpsTo(XML, 'The Crow & Cask')).toBe(1)
  })

  it('counts every warp, not every file', () => {
    const twice = XML.replace(
      '<MapTarget X="6" Y="6">Piet Inn</MapTarget>',
      '<MapTarget X="6" Y="6">The Crow &amp; Cask</MapTarget>'
    )
    expect(countWarpsTo(twice, 'The Crow & Cask')).toBe(2)
  })

  it('is case-sensitive, like the server lookup', () => {
    expect(countWarpsTo(XML, 'piet inn')).toBe(0)
  })

  it('counts nothing for a blank name', () => {
    expect(countWarpsTo(XML, '   ')).toBe(0)
  })

  it('ignores surrounding whitespace in the stored value', () => {
    expect(countWarpsTo('<MapTarget X="0" Y="0">\n  Piet Inn\n</MapTarget>', 'Piet Inn')).toBe(1)
  })
})

describe('rewriteWarpTargets', () => {
  it('repoints only the matching targets, and reports how many', () => {
    const { xml, changed } = rewriteWarpTargets(XML, 'The Crow & Cask', 'The Tagor Tavern')
    expect(changed).toBe(1)
    expect(xml).toContain('<MapTarget X="5" Y="5">The Tagor Tavern</MapTarget>')
    expect(xml).toContain('<MapTarget X="6" Y="6">Piet Inn</MapTarget>')
  })

  it('leaves the Sign alone', () => {
    const { xml } = rewriteWarpTargets(XML, 'The Crow & Cask', 'Tagor Tavern')
    expect(xml).toContain('<Name>The Crow &amp; Cask</Name>')
  })

  it('escapes the new name on the way in', () => {
    const { xml } = rewriteWarpTargets(XML, 'Piet Inn', 'Bar & Grill')
    expect(xml).toContain('<MapTarget X="6" Y="6">Bar &amp; Grill</MapTarget>')
    expect(countWarpsTo(xml, 'Bar & Grill')).toBe(1)
  })

  // A 40-file update should produce 40 one-line diffs, not 40 reformatted files.
  it('changes nothing else in the document', () => {
    const { xml } = rewriteWarpTargets(XML, 'Piet Inn', 'Piet Tavern')
    expect(xml).toBe(XML.replace('>Piet Inn<', '>Piet Tavern<'))
  })

  it('is a no-op when nothing matches', () => {
    const { xml, changed } = rewriteWarpTargets(XML, 'Nowhere', 'Somewhere Else')
    expect(changed).toBe(0)
    expect(xml).toBe(XML)
  })

  it('is a no-op when the name has not actually changed', () => {
    const { xml, changed } = rewriteWarpTargets(XML, 'Piet Inn', ' Piet Inn ')
    expect(changed).toBe(0)
    expect(xml).toBe(XML)
  })

  it('is a no-op for a blank old name', () => {
    expect(rewriteWarpTargets(XML, '', 'X')).toEqual({ xml: XML, changed: 0 })
  })
})
