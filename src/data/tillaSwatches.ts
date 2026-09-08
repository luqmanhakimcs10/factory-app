/**
 * Tilla shades.
 *
 * Not part of the shared SWATCHES palette — tilla is metallic thread and its
 * shades do not overlap with the embroidery colour list.
 *
 * These are the confirmed values. Three of the five were approximated from a
 * screenshot when this file was written and have since been corrected against
 * the authoritative list: silver, copper and antique gold. Gold and rose gold
 * were already right.
 */
export const TILLA_SWATCHES = {
  gold: '#C9A227',
  silver: '#B8BEC4',
  copper: '#B87333',
  antiqueGold: '#8C6F2E',
  roseGold: '#B76E79',
} as const;

export type TillaShade = keyof typeof TILLA_SWATCHES;

export const TILLA_SHADES = Object.keys(TILLA_SWATCHES) as TillaShade[];

/**
 * Display names for the five shades.
 *
 * Beside the hexes rather than in the screens that pick a shade: the picker on
 * Procurement's add-item form and any stock label describing the same spool
 * have to agree, and a key is not a label — `antiqueGold` is not what anyone
 * calls it.
 */
export const TILLA_LABELS: Record<TillaShade, string> = {
  gold: 'Gold',
  silver: 'Silver',
  copper: 'Copper',
  antiqueGold: 'Antique Gold',
  roseGold: 'Rose Gold',
};

export function tillaHex(shade: string): string | null {
  return TILLA_SWATCHES[shade as TillaShade] ?? null;
}

export function tillaLabel(shade: string): string | null {
  return TILLA_LABELS[shade as TillaShade] ?? null;
}
