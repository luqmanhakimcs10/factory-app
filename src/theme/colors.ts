/**
 * FactoryERP colour tokens.
 *
 * These are the only colour literals allowed in the app — components must read
 * from here so a future per-factory theme can swap the palette in one place.
 */
export const colors = {
  /** Screen / app background. */
  bg: '#EEF0EE',
  /** Cards, bars, tiles. */
  surface: '#FFFFFF',
  /** Default hairline border. */
  border: '#DEE2DE',
  /** List-row dividers. */
  borderSubtle: '#EDEEEC',
  /** Draft status pill background. */
  draftBg: '#EDEEEC',
  /** Square icon-button surface in the home header (the notifications bell). */
  controlBg: '#F4F5F3',

  /** Primary text. */
  textPrimary: '#1A2027',
  /** Secondary text and labels. */
  textSecondary: '#5C6670',
  /** Placeholders and hints. */
  textMuted: '#8B9299',

  /** Primary actions, active states, brand navy. */
  primary: '#2B4570',
  /** Icon-circle fills, selected-tile fills, the "in production" pill. */
  neutralAccent: '#E7ECF3',

  /** Pass / completed. */
  success: '#2F6B49',
  /** Success chip / card background. */
  successBg: '#E1EFE6',

  /** In-progress status. */
  warning: '#B97A22',
  /** In-progress chip background. */
  warningBg: '#F7EAD6',

  /** Defects, returns, destructive actions. */
  danger: '#A93F32',
  /** Danger chip / card background. */
  dangerBg: '#FBEEEC',
  /** Danger card border, disabled danger button. */
  dangerBorder: '#EBC3BB',
} as const;

export type ColorToken = keyof typeof colors;
