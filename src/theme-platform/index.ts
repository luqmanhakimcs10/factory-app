import { Platform, StyleSheet } from 'react-native';

/**
 * The platform console's own visual identity.
 *
 * Deliberately NOT the shared `/src/theme` package the six factory-floor
 * modules use. The separation is the point: a screen that spans every tenant
 * should not look like a screen that belongs to one, and an operator glancing
 * at a phone should be able to tell the two apart instantly. Nothing here
 * imports from `/src/theme`, and nothing there should import from here.
 */
export const platformColors = {
  bgApp: '#faf9f5',
  bgSurface: '#ffffff',
  textPrimary: 'rgba(15,12,8,0.92)',
  textSecondary: 'rgba(15,12,8,0.64)',
  /** Primary actions, 1st stat card, active module chip. */
  accentPrimary: '#d97757',
  /** 2nd stat card, Generate Invoice, pending-payment border. */
  accentSecondary: '#6a9bcc',
  /** 3rd stat card, active-status badge, paid styling. */
  accentSuccess: '#558a42',
  /** Defined by the source tokens but unused so far — reserved, not dead. */
  accentWarning: '#c9a82d',
  /** 4th stat card, inactive badge, Deactivate, pending-payment styling. */
  accentError: '#a63244',
  border: 'rgba(15,12,8,0.1)',
} as const;

export const platformSpacing = {
  content: 16,
  block: 14,
  tight: 8,
  hair: 4,
} as const;

export const platformRadius = {
  card: 12,
  chip: 20,
  badge: 999,
} as const;

/**
 * System font stack — no custom webfont, and specifically not IBM Plex. React
 * Native resolves the platform default when `fontFamily` is left unset, so
 * these styles say nothing about family on purpose.
 */
export const platformType = StyleSheet.create({
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: platformColors.textPrimary,
  },
  heading: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: platformColors.textPrimary,
  },
  body: {
    fontSize: 15,
    lineHeight: 20,
    color: platformColors.textPrimary,
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: platformColors.textPrimary,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: platformColors.textSecondary,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    color: platformColors.textSecondary,
  },
  statValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: '#ffffff',
  },
  statLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
  },
});

export const platformLayout = {
  hairline: Platform.OS === 'web' ? 1 : StyleSheet.hairlineWidth,
} as const;
