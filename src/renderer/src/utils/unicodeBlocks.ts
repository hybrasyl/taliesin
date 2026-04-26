export interface UnicodeBlock {
  name: string
  start: number
  end: number
}

export const UNICODE_BLOCKS: UnicodeBlock[] = [
  { name: 'Basic Latin', start: 0x0020, end: 0x007f },
  { name: 'Latin-1 Supplement', start: 0x0080, end: 0x00ff },
  { name: 'Latin Extended-A', start: 0x0100, end: 0x017f },
  { name: 'Latin Extended-B', start: 0x0180, end: 0x024f },
  { name: 'General Punctuation', start: 0x2000, end: 0x206f },
  { name: 'Currency Symbols', start: 0x20a0, end: 0x20cf }
]

export const OTHER_BLOCK: UnicodeBlock = {
  name: 'Other',
  start: -1,
  end: -1
}

export function getBlock(codepoint: number): UnicodeBlock {
  for (const b of UNICODE_BLOCKS) {
    if (codepoint >= b.start && codepoint <= b.end) return b
  }
  return OTHER_BLOCK
}

export function formatCodepoint(codepoint: number): string {
  return 'U+' + codepoint.toString(16).toUpperCase().padStart(4, '0')
}

const CONTROL_LABELS: Record<number, string> = {
  // C0 controls + space + DEL
  0x00: 'NUL', 0x01: 'SOH', 0x02: 'STX', 0x03: 'ETX', 0x04: 'EOT',
  0x05: 'ENQ', 0x06: 'ACK', 0x07: 'BEL', 0x08: 'BS',  0x09: 'HT',
  0x0a: 'LF',  0x0b: 'VT',  0x0c: 'FF',  0x0d: 'CR',  0x0e: 'SO',
  0x0f: 'SI',  0x10: 'DLE', 0x11: 'DC1', 0x12: 'DC2', 0x13: 'DC3',
  0x14: 'DC4', 0x15: 'NAK', 0x16: 'SYN', 0x17: 'ETB', 0x18: 'CAN',
  0x19: 'EM',  0x1a: 'SUB', 0x1b: 'ESC', 0x1c: 'FS',  0x1d: 'GS',
  0x1e: 'RS',  0x1f: 'US',  0x20: 'SP',  0x7f: 'DEL',
  // C1 controls
  0x80: 'PAD', 0x81: 'HOP', 0x82: 'BPH', 0x83: 'NBH', 0x84: 'IND',
  0x85: 'NEL', 0x86: 'SSA', 0x87: 'ESA', 0x88: 'HTS', 0x89: 'HTJ',
  0x8a: 'VTS', 0x8b: 'PLD', 0x8c: 'PLU', 0x8d: 'RI',  0x8e: 'SS2',
  0x8f: 'SS3', 0x90: 'DCS', 0x91: 'PU1', 0x92: 'PU2', 0x93: 'STS',
  0x94: 'CCH', 0x95: 'MW',  0x96: 'SPA', 0x97: 'EPA', 0x98: 'SOS',
  0x9a: 'SCI', 0x9b: 'CSI', 0x9c: 'ST',  0x9d: 'OSC', 0x9e: 'PM',
  0x9f: 'APC',
  // Other invisibles in Latin-1
  0xa0: 'NBSP', 0xad: 'SHY'
}

/**
 * Short human-readable label for a codepoint. Returns the printable glyph for
 * normal characters and a 2–4 letter mnemonic for control codepoints (NUL,
 * DEL, NBSP, …) so empty/unprintable slots still get a useful label.
 */
export function codepointLabel(codepoint: number): string {
  const ctrl = CONTROL_LABELS[codepoint]
  if (ctrl) return ctrl
  if (codepoint < 0x20 || (codepoint >= 0x7f && codepoint < 0xa0)) return '·'
  try {
    return String.fromCodePoint(codepoint)
  } catch {
    return ''
  }
}
