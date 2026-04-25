import { Palette, PaletteEntry } from './paletteTypes'

export type PresetId = 'blank' | 'hybrasyl-elements' | 'greyscale' | 'sepia' | 'da-classic'

export interface PresetMeta {
  id: PresetId
  label: string
  description: string
}

export const PRESET_LIST: PresetMeta[] = [
  { id: 'blank', label: 'Blank', description: 'Single empty entry' },
  {
    id: 'hybrasyl-elements',
    label: 'Hybrasyl Elements',
    description: '17 entries for the Hybrasyl element scheme'
  },
  {
    id: 'greyscale',
    label: 'Greyscale',
    description: 'Single neutral entry from charcoal to bone'
  },
  { id: 'sepia', label: 'Sepia', description: 'Single warm-brown entry, classic sepia tones' },
  {
    id: 'da-classic',
    label: 'Dark Ages Classic',
    description: 'Single entry in the muted parchment palette of the original DA client'
  }
]

type Template = Omit<Palette, 'id' | 'name' | 'lastModified'>

const HYBRASYL_ELEMENT_ENTRIES: PaletteEntry[] = [
  {
    id: 'fire',
    name: 'Fire',
    shadowColor: '#7A1A00',
    highlightColor: '#FF8A3D',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'primary'
  },
  {
    id: 'water',
    name: 'Water',
    shadowColor: '#0A2B66',
    highlightColor: '#4FB3FF',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'primary'
  },
  {
    id: 'earth',
    name: 'Earth',
    shadowColor: '#3A2010',
    highlightColor: '#B07A44',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'primary'
  },
  {
    id: 'wind',
    name: 'Wind',
    shadowColor: '#4A6A5A',
    highlightColor: '#CFEFD8',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'primary'
  },
  {
    id: 'light',
    name: 'Light',
    shadowColor: '#8A7A2A',
    highlightColor: '#FFF6B8',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'primary'
  },
  {
    id: 'dark',
    name: 'Dark',
    shadowColor: '#14052A',
    highlightColor: '#7A4FB3',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'primary'
  },
  {
    id: 'lightning',
    name: 'Lightning',
    shadowColor: '#332A00',
    highlightColor: '#FFEE66',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.4,
    category: 'composite'
  },
  {
    id: 'ice',
    name: 'Ice',
    shadowColor: '#1A3A55',
    highlightColor: '#B8F0FF',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'composite'
  },
  {
    id: 'nature',
    name: 'Nature',
    shadowColor: '#143A1A',
    highlightColor: '#7ACF4A',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'composite'
  },
  {
    id: 'metal',
    name: 'Metal',
    shadowColor: '#2A2E33',
    highlightColor: '#C0CAD4',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'composite'
  },
  {
    id: 'poison',
    name: 'Poison',
    shadowColor: '#2A0A3A',
    highlightColor: '#9CE060',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'composite'
  },
  {
    id: 'sound',
    name: 'Sound',
    shadowColor: '#2A2A5A',
    highlightColor: '#C4C4FF',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'composite'
  },
  {
    id: 'mental',
    name: 'Mental',
    shadowColor: '#3A1A4A',
    highlightColor: '#E0A4FF',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'composite'
  },
  {
    id: 'void',
    name: 'Void',
    shadowColor: '#0A0A14',
    highlightColor: '#5A5A7A',
    defaultDarkFactor: 0.4,
    defaultLightFactor: 0.2,
    category: 'advanced'
  },
  {
    id: 'chaos',
    name: 'Chaos',
    shadowColor: '#4A0033',
    highlightColor: '#FF55AA',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'advanced'
  },
  {
    id: 'order',
    name: 'Order',
    shadowColor: '#1A3A5A',
    highlightColor: '#CFE6FF',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'advanced'
  },
  {
    id: 'spirit',
    name: 'Spirit',
    shadowColor: '#3A3A1A',
    highlightColor: '#FFEED0',
    defaultDarkFactor: 0.3,
    defaultLightFactor: 0.3,
    category: 'advanced'
  }
]

const TEMPLATES: Record<PresetId, Template> = {
  blank: {
    description: '',
    version: 1,
    entries: [
      {
        id: 'entry_1',
        name: 'Entry 1',
        shadowColor: '#333333',
        highlightColor: '#CCCCCC',
        defaultDarkFactor: 0.3,
        defaultLightFactor: 0.3
      }
    ]
  },
  'hybrasyl-elements': {
    description: 'Element-themed palette for the Hybrasyl form-swap ability icons.',
    version: 1,
    entries: HYBRASYL_ELEMENT_ENTRIES
  },
  greyscale: {
    description: 'Neutral charcoal-to-bone duotone.',
    version: 1,
    entries: [
      {
        id: 'grey',
        name: 'Greyscale',
        shadowColor: '#1A1A1A',
        highlightColor: '#E0E0E0',
        defaultDarkFactor: 0.3,
        defaultLightFactor: 0.3
      }
    ]
  },
  sepia: {
    description: 'Classic warm-brown sepia.',
    version: 1,
    entries: [
      {
        id: 'sepia',
        name: 'Sepia',
        shadowColor: '#3A2810',
        highlightColor: '#E8D8B0',
        defaultDarkFactor: 0.3,
        defaultLightFactor: 0.3
      }
    ]
  },
  'da-classic': {
    description: 'Warm copper/sepia tones matching the original Dark Ages skill icons (gui06.pal).',
    version: 1,
    entries: [
      {
        id: 'classic',
        name: 'DA Classic',
        shadowColor: '#3A1F10',
        highlightColor: '#E8B888',
        defaultDarkFactor: 0.5,
        defaultLightFactor: 0.25
      }
    ]
  }
}

export function buildFromPreset(preset: PresetId, id: string, name: string): Palette {
  const template = TEMPLATES[preset]
  return {
    ...template,
    id,
    name,
    lastModified: new Date().toISOString(),
    entries: template.entries.map((e) => ({ ...e }))
  }
}
