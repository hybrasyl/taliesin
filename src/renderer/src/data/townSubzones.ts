/**
 * The town subzone registry: what a town map's id says about what the map is.
 *
 * A town map's id decomposes as `30000 + town × 100 + subzone`, so
 * `hyb30909 - Tagor Tavern.xml` is town 09 (Tagor), subzone 09 (Tavern).
 * Verified across `world/xml/maps`: every id-prefixed XML follows it, and the
 * slots below hold across all three towns that use the scheme (HTOO-356).
 *
 * **The slot is a role, not a name.** Slot 14 is the wizard trainer, and the
 * three towns call it `Dark Wizard`, `Dark Wizard` and `Wizard Trainer`. Slot 16
 * is `Monk Trainer`, `Sabonim` and `Animist Trainer`. So this table can say what
 * a slot is *for*; it cannot say what to call it, and nothing here should ever
 * write a name into a map on its own.
 *
 * **Binaries are `lod`, XMLs are `hyb`.** The `.map` binary is always
 * `lod`-prefixed; the XML for ids ≥ 30000 is `hyb`-prefixed by the 30000 rule.
 * One map is `lod30202.map` and `hyb30202 - Abel Armory.xml`. Reading this table
 * beside a file listing is where that catches people out.
 */

export interface Subzone {
  /** The last two digits of the map id. */
  slot: number
  /** What the slot is for. Not a name to use — see the note above. */
  role: string
  /** The sign art the subzone conventionally carries, where it has one. */
  sign?: string
}

/**
 * Slots 00–37, which are consistent across the towns that use the scheme.
 * 38 and above are free-form general town maps and are described separately.
 */
export const TOWN_SUBZONES: readonly Subzone[] = [
  { slot: 0, role: 'Town' },
  { slot: 1, role: 'Market Threshold' },
  { slot: 2, role: 'Armor Smith', sign: 'Shield' },
  { slot: 3, role: 'Weapon Smith', sign: 'Sword' },
  { slot: 4, role: 'Bank', sign: 'Won' },
  { slot: 5, role: 'Trader', sign: 'Bags' },
  { slot: 6, role: 'Messenger', sign: 'Bird' },
  { slot: 7, role: 'Shrine' },
  { slot: 8, role: 'Restaurant', sign: 'Meat' },
  { slot: 9, role: 'Tavern', sign: 'Wine' },
  { slot: 10, role: 'Alchemist', sign: 'Potions' },
  { slot: 11, role: 'Stylist', sign: 'Scissor / Comb' },
  { slot: 12, role: 'Rogue Trainer', sign: 'Dragon' },
  { slot: 13, role: 'Warrior Trainer', sign: 'Fist' },
  { slot: 14, role: 'Wizard Trainer', sign: 'Black Fire' },
  { slot: 15, role: 'Priest Trainer', sign: 'White Fire' },
  { slot: 16, role: 'Sabonim', sign: 'Mini Wood Plaque' },
  { slot: 17, role: 'Professions Trainer', sign: 'Hammer' },
  { slot: 18, role: 'Town Hall', sign: 'Gem' },
  { slot: 19, role: 'Courtroom', sign: 'Gem' },
  { slot: 20, role: 'Conquest', sign: 'Gem' },
  { slot: 21, role: 'Class Enclave 1', sign: 'Book' },
  { slot: 22, role: 'Class Enclave 2', sign: 'Book' },
  { slot: 23, role: 'Class Enclave 3', sign: 'Book' },
  { slot: 24, role: 'Class Enclave 4', sign: 'Book' },
  { slot: 25, role: 'Inn', sign: 'House' },
  { slot: 26, role: 'Inn Corridor 1' },
  { slot: 27, role: 'Inn Room 1' },
  { slot: 28, role: 'Inn Room 2' },
  { slot: 29, role: 'Inn Room 3' },
  { slot: 30, role: 'Inn Room 4' },
  { slot: 31, role: 'Inn Room 5' },
  { slot: 32, role: 'Inn Room 6' },
  { slot: 33, role: 'Inn Room 7' },
  { slot: 34, role: 'Inn Room 8' },
  { slot: 35, role: 'Inn Room 9' },
  { slot: 36, role: 'Inn Room 10' },
  { slot: 37, role: 'Inn Corridor 2' }
]

/** The first slot with no assigned role — everything from here is general town. */
export const FIRST_GENERAL_SLOT = 38

/** The last id the town scheme covers. */
const TOWN_ID_MIN = 30000
const TOWN_ID_MAX = 39999

export interface TownMapId {
  town: number
  slot: number
  /** The registry entry, when the slot has one. */
  subzone?: Subzone
  /** True for slots at or above {@link FIRST_GENERAL_SLOT}. */
  general: boolean
}

/**
 * Decompose a map id into its town and subzone, or `null` when the id is
 * outside the town range.
 *
 * `null` rather than a guess: the great majority of maps in a world are not
 * town maps, and offering a subzone for a wilderness map would be inventing
 * information.
 */
export function decodeTownMapId(id: number): TownMapId | null {
  if (!Number.isInteger(id) || id < TOWN_ID_MIN || id > TOWN_ID_MAX) return null
  const offset = id - TOWN_ID_MIN
  const town = Math.floor(offset / 100)
  const slot = offset % 100
  return {
    town,
    slot,
    subzone: TOWN_SUBZONES.find((s) => s.slot === slot),
    general: slot >= FIRST_GENERAL_SLOT
  }
}
