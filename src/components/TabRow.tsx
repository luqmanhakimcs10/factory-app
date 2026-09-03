import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, type } from '../theme';

export interface TabDef<K extends string> {
  key: K;
  label: string;
  /** Live count badge. Omit to hide the badge entirely. */
  count?: number;
}

export interface TabRowProps<K extends string> {
  tabs: readonly TabDef<K>[];
  activeKey: K;
  onChange: (key: K) => void;
}

/** Horizontally scrollable pill tabs with optional count badges. */
export function TabRow<K extends string>({ tabs, activeKey, onChange }: TabRowProps<K>) {
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(tab.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[type.pill, active ? styles.labelActive : styles.label]}>
                {tab.label}
              </Text>
              {tab.count === undefined ? null : (
                <View style={[styles.badge, active && styles.badgeActive]}>
                  <Text style={[type.pill, active ? styles.labelActive : styles.label]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.border,
  },
  row: {
    gap: spacing.tight - 2,
    paddingHorizontal: spacing.content,
    paddingVertical: spacing.tight + 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.hair + 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  label: {
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.surface,
  },
  badge: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.border,
  },
  badgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
  },
});
