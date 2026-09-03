/**
 * The shared thread-colour palette.
 *
 * `id` is what gets persisted in `order_sheets.color_id` and
 * `inspection_units.color_id`, so these keys are part of the data contract —
 * renaming one is a migration, not a refactor.
 */
export interface Swatch {
  id: string;
  label: string;
  /** Fill colour. `null` for the `custom` entry, which renders as a placeholder. */
  hex: string | null;
  /** Near-white swatches need a visible outline of their own. */
  bordered?: boolean;
  /** The `custom` entry: dashed border + "+" icon, no picker UI yet. */
  isCustom?: boolean;
}

export const SWATCHES: readonly Swatch[] = [
  { id: 'red', label: 'Red', hex: '#C0392B' },
  { id: 'royal', label: 'Royal', hex: '#2B4570' },
  { id: 'green', label: 'Green', hex: '#2F6B49' },
  { id: 'yellow', label: 'Yellow', hex: '#D4A017' },
  { id: 'black', label: 'Black', hex: '#1A1A1A' },
  { id: 'white', label: 'White', hex: '#F7F7F3', bordered: true },
  { id: 'orange', label: 'Orange', hex: '#C56A15' },
  { id: 'purple', label: 'Purple', hex: '#6B4C7A' },
  { id: 'pink', label: 'Pink', hex: '#C4607E' },
  { id: 'grey', label: 'Grey', hex: '#8A9099' },
  { id: 'custom', label: 'Custom', hex: null, isCustom: true },
] as const;

export const CUSTOM_SWATCH_ID = 'custom';

export function getSwatch(colorId: string): Swatch | undefined {
  return SWATCHES.find((s) => s.id === colorId);
}

/**
 * Resolve a stored sheet colour to a fill. `custom_hex` wins when the sheet
 * uses the `custom` swatch; returns `null` when there is nothing to fill with.
 */
export function resolveSwatchHex(
  colorId: string,
  customHex?: string | null,
): string | null {
  if (colorId === CUSTOM_SWATCH_ID) return customHex ?? null;
  return getSwatch(colorId)?.hex ?? null;
}
