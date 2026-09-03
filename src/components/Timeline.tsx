import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { colors, layout, radius, spacing, type } from '../theme';
import { ORDER_STAGES, STAGE_LABELS, type OrderStage } from '../data/types';

export type TimelineStageState = 'pending' | 'active' | 'done';

type StageKey = NonNullable<OrderStage>;

const STAGE_ICONS: Record<StageKey, React.ComponentProps<typeof Feather>['name']> = {
  inspection: 'search',
  coding: 'hash',
  jobcard: 'clipboard',
  production: 'settings',
  finishing: 'scissors',
  delivery: 'truck',
};

const NODE = 32;

export interface TimelineProps {
  /**
   * The stage the order is currently on. Everything before it renders `done`,
   * it renders `active`, everything after renders `pending`. `null` means the
   * order has not entered the pipeline yet.
   */
  currentStage: OrderStage;
  /** Per-stage override, for orders that skipped or reopened a stage. */
  stageStates?: Partial<Record<StageKey, TimelineStageState>>;
  /** Optional second line per stage, e.g. a completion date. */
  stageNotes?: Partial<Record<StageKey, string>>;
  style?: ViewStyle;
}

/** The six pipeline stages, fixed order, with the connecting line. */
export function Timeline({
  currentStage,
  stageStates,
  stageNotes,
  style,
}: TimelineProps) {
  const currentIndex = currentStage ? ORDER_STAGES.indexOf(currentStage) : -1;

  return (
    <View style={style}>
      {ORDER_STAGES.map((stage, index) => {
        const state: TimelineStageState =
          stageStates?.[stage] ??
          (currentIndex === -1
            ? 'pending'
            : index < currentIndex
              ? 'done'
              : index === currentIndex
                ? 'active'
                : 'pending');

        const tone =
          state === 'done'
            ? { fg: colors.success, bg: colors.successBg }
            : state === 'active'
              ? { fg: colors.warning, bg: colors.warningBg }
              : { fg: colors.textMuted, bg: colors.borderSubtle };

        const isLast = index === ORDER_STAGES.length - 1;

        return (
          <View key={stage} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.node, { backgroundColor: tone.bg }]}>
                <Feather
                  name={state === 'done' ? 'check' : STAGE_ICONS[stage]}
                  size={16}
                  color={tone.fg}
                />
              </View>
              {!isLast ? (
                <View
                  style={[
                    styles.connector,
                    {
                      backgroundColor:
                        state === 'done' ? colors.success : colors.border,
                    },
                  ]}
                />
              ) : null}
            </View>

            <View style={[styles.body, isLast && styles.bodyLast]}>
              <Text style={[type.bodyStrong, state === 'pending' && styles.mutedText]}>
                {STAGE_LABELS[stage]}
              </Text>
              {stageNotes?.[stage] ? (
                <Text style={type.label}>{stageNotes[stage]}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.tight + 2,
  },
  rail: {
    alignItems: 'center',
    width: NODE,
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: radius.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connector: {
    flex: 1,
    width: 2,
    minHeight: spacing.block,
  },
  body: {
    flex: 1,
    paddingBottom: spacing.block + spacing.hair,
    paddingTop: spacing.hair,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
    marginBottom: spacing.hair,
  },
  bodyLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  mutedText: {
    color: colors.textMuted,
  },
});
