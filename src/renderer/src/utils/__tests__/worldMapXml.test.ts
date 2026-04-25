import { describe, it, expect } from 'vitest'
import { parseWorldMapXml, serializeWorldMapXml } from '../worldMapXml'
import type { WorldMapData } from '../../data/worldMapData'

describe('parseWorldMapXml', () => {
  it('parses a minimal world map', () => {
    const xml = `<WorldMap ClientMap="loures.txt"><Name>Loures</Name></WorldMap>`
    const data = parseWorldMapXml(xml)
    expect(data.name).toBe('Loures')
    expect(data.clientMap).toBe('loures.txt')
    expect(data.points).toEqual([])
  })

  it('strips xmlns and parses points', () => {
    const xml = `<WorldMap xmlns="http://www.hybrasyl.com/XML/Hybrasyl/2020-02" ClientMap="cm">
      <Name>Test</Name>
      <Points>
        <Point X="10" Y="20">
          <Name>Inn</Name>
          <Target X="5" Y="6">somemap</Target>
        </Point>
      </Points>
    </WorldMap>`
    const data = parseWorldMapXml(xml)
    expect(data.name).toBe('Test')
    expect(data.points).toHaveLength(1)
    expect(data.points[0]).toEqual({
      x: 10, y: 20, name: 'Inn',
      targetMap: 'somemap', targetX: 5, targetY: 6,
    })
  })

  it('defaults missing target attributes to 0 and empty string', () => {
    const xml = `<WorldMap ClientMap="cm"><Name>T</Name><Points>
      <Point X="1" Y="2"><Name>p</Name></Point>
    </Points></WorldMap>`
    const data = parseWorldMapXml(xml)
    expect(data.points[0].targetMap).toBe('')
    expect(data.points[0].targetX).toBe(0)
    expect(data.points[0].targetY).toBe(0)
  })

  it('returns sensible defaults for a well-formed but empty WorldMap element', () => {
    const data = parseWorldMapXml('<WorldMap></WorldMap>')
    expect(data.name).toBe('')
    expect(data.clientMap).toBe('')
    expect(data.points).toEqual([])
  })

  it('throws on truly malformed XML (parsererror documentElement)', () => {
    expect(() => parseWorldMapXml('<WorldMap><Name>x</WorldMap>')).toThrow(/XML parse error/)
    expect(() => parseWorldMapXml('<<<>>')).toThrow(/XML parse error/)
    expect(() => parseWorldMapXml('')).toThrow(/XML parse error/)
  })
})

describe('serializeWorldMapXml', () => {
  it('emits xml header and namespace', () => {
    const xml = serializeWorldMapXml({ name: 'T', clientMap: 'cm', points: [] })
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>')
    expect(xml).toContain('xmlns="http://www.hybrasyl.com/XML/Hybrasyl/2020-02"')
    expect(xml).toContain('<Name>T</Name>')
    expect(xml).not.toContain('<Points>')
  })

  it('escapes special characters in name, clientMap, and target', () => {
    const xml = serializeWorldMapXml({
      name: 'A & <B>',
      clientMap: 'has "q"',
      points: [{ x: 1, y: 2, name: '<n>', targetMap: 'a&b', targetX: 0, targetY: 0 }],
    })
    expect(xml).toContain('<Name>A &amp; &lt;B&gt;</Name>')
    expect(xml).toContain('ClientMap="has &quot;q&quot;"')
    expect(xml).toContain('<Name>&lt;n&gt;</Name>')
    expect(xml).toContain('a&amp;b')
  })

  it('round-trips a populated world map', () => {
    const original: WorldMapData = {
      name: 'Round Trip',
      clientMap: 'rt.txt',
      points: [
        { x: 1, y: 2, name: 'A', targetMap: 'mapA', targetX: 5, targetY: 6 },
        { x: 7, y: 8, name: 'B', targetMap: 'mapB', targetX: 9, targetY: 10 },
      ],
    }
    expect(parseWorldMapXml(serializeWorldMapXml(original))).toEqual(original)
  })
})
