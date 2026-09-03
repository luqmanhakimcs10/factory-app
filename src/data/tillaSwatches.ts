/**
 * Tilla shades.
 *
 * Not part of the shared SWATCHES palette — tilla is metallic thread and its
 * shades do not overlap with the embroidery colour list. These hexes are
 * approximated from screenshots; confirm them against real spools before
 * treating them as final.
 */
export const TILLA_SWATCHES = {
  gold: '#C9A227',
  silver: '#B9BEC4',
  copper: '#B5651D',
  antiqueGold: '#8A7215',
  roseGold: '#B76E79',
} as const;

export type TillaShade = keyof typeof TILLA_SWATCHES;

export function tillaHex(shade: string): string | null {
  return TILLA_SWATCHES[shade as TillaShade] ?? null;
}
