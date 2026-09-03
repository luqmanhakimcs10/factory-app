import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';
import { ColorSwatch } from './ColorSwatch';

export interface IssueCardProps {
  orderCode: string;
  clientName: string;
  designCode: string | null;
  /** One per material on the order. */
  swatches?: { colorId: string; customHex?: string | null }[];
  /** `ready` is waiting on the store; `issued` has already gone out. */
  state: 'ready' | 'issued';
  /** "Issued by {name}" line, on issued cards only. */
  issuedBy?: string | null;
  onPress?: () => void;
}

export function IssueCard({
  orderCode,
  clientName,
  designCode,
  swatches = [],
  state,
  issuedBy,
  onPress,
}: IssueCardProps) {
  const issued = state === 'issued';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${orderCode}, ${clientName}`}
      disabled={!onPress}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.header}>
        <Text style={type.code}>{orderCode}</Text>
        <View style={[styles.pill, issued ? styles.pillIssued : styles.pillReady]}>
          <Feather
            name={issued ? 'check' : 'clock'}
            size={12}
            color={issued ? colors.success : colors.warning}
          />
          <Text
            style={[type.pill, { color: issued ? colors.success : colors.warning }]}
          >
            {issued ? 'Issued' : 'Ready to Issue'}
          </Text>
        </View>
      </View>

      <Text style={type.bodyStrong} numberOfLines={1}>
        {clientName}
      </Text>
      <Text style={type.label}>
        {designCode ?? 'No design code'}
        {issued && issuedBy ? ` · Issued by ${issuedBy}` : ''}
      </Text>

      {swatches.length > 0 ? (
        <View style={styles.swatches}>
          {swatches.map((swatch, index) => (
            <ColorSwatch
              key={`${swatch.colorId}-${index}`}
              colorId={swatch.colorId}
              customHex={swatch.customHex}
              size={16}
              interactive={false}
            />
          ))}
        </View>
      ) : null}
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pillReady: {
    backgroundColor: colors.warningBg,
  },
  pillIssued: {
    backgroundColor: colors.successBg,
  },
  swatches: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.tight - 2,
  },
});
