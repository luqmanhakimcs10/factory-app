import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, type } from '../theme';
import { ColorSwatch } from './ColorSwatch';

export interface POCardSwatch {
  colorId: string | null;
  hex?: string | null;
}

export interface POCardProps {
  poNumber: string;
  /** Supplier name once assigned, otherwise a generic status title. */
  title: string;
  /** MANUAL / SYSTEM-GENERATED. */
  tag: string;
  date: string;
  /** One per material on the PO. Empty for a manual PO with nothing assigned yet. */
  swatches?: POCardSwatch[];
  onPress?: () => void;
}

export function POCard({
  poNumber,
  title,
  tag,
  date,
  swatches = [],
  onPress,
}: POCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${poNumber}, ${title}`}
      disabled={!onPress}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.header}>
        <Text style={type.code}>{poNumber}</Text>
        <View style={styles.tag}>
          <Text style={[type.pill, styles.tagLabel]}>{tag}</Text>
        </View>
      </View>

      <Text style={type.bodyStrong} numberOfLines={1}>
        {title}
      </Text>
      <Text style={type.label}>{date}</Text>

      <View style={styles.swatches}>
        {swatches.length === 0 ? (
          // A manual PO has no supplier and no material list yet, so the row
          // shows a neutral placeholder rather than nothing at all.
          <View style={styles.placeholderSwatch} />
        ) : (
          swatches.map((swatch, index) =>
            swatch.colorId ? (
              <ColorSwatch
                key={`${swatch.colorId}-${index}`}
                colorId={swatch.colorId}
                customHex={swatch.hex}
                size={16}
                interactive={false}
              />
            ) : (
              <View
                key={`hex-${index}`}
                style={[
                  styles.plainSwatch,
                  { backgroundColor: swatch.hex ?? colors.borderSubtle },
                ]}
              />
            ),
          )
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    padding: spacing.content - 2,
    gap: spacing.hair,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralAccent,
  },
  tagLabel: {
    color: colors.primary,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  swatches: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.tight - 2,
  },
  plainSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  placeholderSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.borderSubtle,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
});
