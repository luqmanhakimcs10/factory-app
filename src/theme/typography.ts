import { TextStyle } from 'react-native';

// Imported per weight, not from the package root: the root re-exports every
// weight and italic, and Metro would bundle all ~40 TTFs (about 9 MB) into the
// app even though only these eight are ever used.
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexSansCondensed_500Medium } from '@expo-google-fonts/ibm-plex-sans-condensed/500Medium';
import { IBMPlexSansCondensed_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-condensed/600SemiBold';
import { IBMPlexSansCondensed_700Bold } from '@expo-google-fonts/ibm-plex-sans-condensed/700Bold';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono/600SemiBold';
import { IBMPlexMono_700Bold } from '@expo-google-fonts/ibm-plex-mono/700Bold';

import { colors } from './colors';

/**
 * The font map handed to `useFonts` at the app root. Keys are the exact
 * `fontFamily` strings used by the styles below.
 */
export const fontAssets = {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSansCondensed_500Medium,
  IBMPlexSansCondensed_600SemiBold,
  IBMPlexSansCondensed_700Bold,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
};

/**
 * Font families by role.
 *
 * - `sans`      IBM Plex Sans — body text.
 * - `condensed` IBM Plex Sans Condensed — headings, large numeric titles.
 * - `mono`      IBM Plex Mono — order codes, phone numbers, counters, anything
 *               tabular or exact.
 *
 * React Native has no synthetic weights for custom fonts: pick the family that
 * already carries the weight rather than setting `fontWeight`.
 */
export const fonts = {
  sans: {
    regular: 'IBMPlexSans_400Regular',
    medium: 'IBMPlexSans_500Medium',
    semibold: 'IBMPlexSans_600SemiBold',
  },
  condensed: {
    medium: 'IBMPlexSansCondensed_500Medium',
    semibold: 'IBMPlexSansCondensed_600SemiBold',
    bold: 'IBMPlexSansCondensed_700Bold',
  },
  mono: {
    medium: 'IBMPlexMono_500Medium',
    semibold: 'IBMPlexMono_600SemiBold',
    /** Dashboard counts and P&L figures — the mockup specifies weight 700. */
    bold: 'IBMPlexMono_700Bold',
  },
} as const;

/** Named text styles. Screens should compose these rather than re-declaring sizes. */
export const type = {
  /** Screen title in a TopBar `bar` variant. */
  title: {
    fontFamily: fonts.condensed.semibold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  /** Factory name in a TopBar `home` variant. */
  brand: {
    fontFamily: fonts.condensed.bold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  /** Section / card heading. */
  heading: {
    fontFamily: fonts.condensed.semibold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  /** Large numeric display (stepper value, counters). */
  numeric: {
    fontFamily: fonts.mono.semibold,
    fontSize: 30,
    lineHeight: 36,
    color: colors.textPrimary,
  },
  /** Body copy. */
  body: {
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  /** Emphasised body — client names, row primaries. */
  bodyStrong: {
    fontFamily: fonts.sans.semibold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  /** Secondary line under a primary. */
  label: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  /** Small uppercase-ish caption / hint. */
  caption: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  /** Order codes, phone numbers — exact, tabular. */
  code: {
    fontFamily: fonts.mono.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  /** Status pill / chip label. */
  pill: {
    fontFamily: fonts.sans.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
  /** Button label. */
  button: {
    fontFamily: fonts.sans.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
} satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof type;
