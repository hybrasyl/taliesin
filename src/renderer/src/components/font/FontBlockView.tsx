import React, { useMemo } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import FontGlyphTile from './FontGlyphTile'
import { OTHER_BLOCK, UNICODE_BLOCKS, UnicodeBlock } from '../../utils/unicodeBlocks'

interface Props {
  glyphs: Uint8Array[]
  startCodepoint: number
  selectedIndex: number | null
  onSelect: (index: number) => void
  onPadToCodepoint: (codepoint: number) => void
}

interface FilledSlot {
  kind: 'filled'
  index: number
  codepoint: number
  glyph: Uint8Array
}

interface PlaceholderSlot {
  kind: 'placeholder'
  codepoint: number
}

type Slot = FilledSlot | PlaceholderSlot

interface Section {
  block: UnicodeBlock
  slots: Slot[]
}

function buildSections(glyphs: Uint8Array[], startCodepoint: number): Section[] {
  // Map each block we care about to filled slots whose codepoint lands inside.
  const sectionsByBlock = new Map<UnicodeBlock, FilledSlot[]>()
  const otherSlots: FilledSlot[] = []
  for (let i = 0; i < glyphs.length; i++) {
    const cp = startCodepoint + i
    const block = UNICODE_BLOCKS.find((b) => cp >= b.start && cp <= b.end)
    const slot: FilledSlot = { kind: 'filled', index: i, codepoint: cp, glyph: glyphs[i] }
    if (!block) {
      otherSlots.push(slot)
      continue
    }
    const arr = sectionsByBlock.get(block)
    if (arr) arr.push(slot)
    else sectionsByBlock.set(block, [slot])
  }

  const sections: Section[] = []
  for (const block of UNICODE_BLOCKS) {
    const filled = sectionsByBlock.get(block)
    if (!filled || filled.length === 0) continue
    // Within a block, render a placeholder for every codepoint between the
    // block's start and the last filled codepoint that has no glyph yet —
    // including gaps before the first filled codepoint. Don't render
    // placeholders past the last filled slot (avoid an unbounded "rest of
    // block" wall of empty tiles).
    const lastFilledCp = filled[filled.length - 1].codepoint
    const filledByCp = new Map(filled.map((s) => [s.codepoint, s]))
    const slots: Slot[] = []
    for (let cp = block.start; cp <= lastFilledCp; cp++) {
      const f = filledByCp.get(cp)
      slots.push(f ?? { kind: 'placeholder', codepoint: cp })
    }
    sections.push({ block, slots })
  }

  if (otherSlots.length > 0) sections.push({ block: OTHER_BLOCK, slots: otherSlots })
  return sections
}

const FontBlockView: React.FC<Props> = ({
  glyphs,
  startCodepoint,
  selectedIndex,
  onSelect,
  onPadToCodepoint
}) => {
  const sections = useMemo(
    () => buildSections(glyphs, startCodepoint),
    [glyphs, startCodepoint]
  )

  if (sections.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No glyphs loaded.</Typography>
      </Box>
    )
  }

  return (
    <Stack spacing={2} sx={{ p: 1 }}>
      {sections.map(({ block, slots }) => {
        const filledCount = slots.filter((s) => s.kind === 'filled').length
        return (
          <Box key={block.name}>
            <Typography variant="overline" sx={{ pl: 1, color: 'text.secondary' }}>
              {block.name} · {filledCount} glyph{filledCount === 1 ? '' : 's'}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
                gap: 0.5,
                p: 1
              }}
            >
              {slots.map((slot) =>
                slot.kind === 'filled' ? (
                  <FontGlyphTile
                    key={`f${slot.index}`}
                    glyph={slot.glyph}
                    index={slot.index}
                    codepoint={slot.codepoint}
                    selected={selectedIndex === slot.index}
                    onClick={() => onSelect(slot.index)}
                  />
                ) : (
                  <FontGlyphTile
                    key={`p${slot.codepoint}`}
                    index={-1}
                    codepoint={slot.codepoint}
                    variant="placeholder"
                    onClick={() => onPadToCodepoint(slot.codepoint)}
                  />
                )
              )}
            </Box>
          </Box>
        )
      })}
    </Stack>
  )
}

export default FontBlockView
