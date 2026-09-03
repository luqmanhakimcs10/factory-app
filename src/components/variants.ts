/**
 * The three states every interactive tile / card in the app supports.
 *
 * `filled` is the PhotoTile-flavoured name for `selected` — they render
 * differently but occupy the same slot in the state machine, so both live in
 * one union rather than each screen inventing its own prop.
 */
export type InteractiveVariant = 'default' | 'selected' | 'filled' | 'disabled';

export function isActiveVariant(variant: InteractiveVariant): boolean {
  return variant === 'selected' || variant === 'filled';
}

export function isDisabledVariant(variant: InteractiveVariant): boolean {
  return variant === 'disabled';
}
