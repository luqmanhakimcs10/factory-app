/**
 * Layout constants.
 *
 * The design reference canvas is 390x844 (iPhone-ish). Treat it as a ratio
 * reference, not a pixel target — every screen must survive real device sizes,
 * so use these tokens plus flex rather than absolute canvas coordinates.
 */
export const spacing = {
  /** Horizontal + vertical padding of the scrollable content area. */
  content: 16,
  /** Vertical gap between blocks inside the content area. */
  block: 14,
  /** Small inner gap (icon-to-label, chip padding). */
  tight: 8,
  /** Extra-small gap. */
  hair: 4,
} as const;

export const radius = {
  /** Cards and controls. */
  card: 12,
  /** Feature tiles (photo tiles, large selectable tiles). */
  tile: 14,
  /** Pills and chips. */
  pill: 20,
  /** Icon-in-rounded-square (InfoRow, Timeline nodes). */
  icon: 10,
} as const;

export const layout = {
  /** Height of the sticky bottom bar footer. */
  bottomBarHeight: 50,
  /** Height of the TopBar content row (excluding the safe-area inset). */
  topBarHeight: 56,
  /** Default hairline border width. */
  hairline: 1,
  /** Design reference canvas — for ratio maths only, never hard sizing. */
  referenceWidth: 390,
  referenceHeight: 844,
} as const;
