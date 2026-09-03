import { useCallback } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card, EmptyState, InfoRow, TopBar } from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import type { InspectionStackParamList } from '../../../navigation/InspectionStack';
import { getOrderUnits } from '../api';

type Props = NativeStackScreenProps<InspectionStackParamList, 'Complete'>;

/** Reached once `findFirstPendingUnit` finds nothing left on the order. */
export function CompleteScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();

  const fetcher = useCallback(() => getOrderUnits(orderId), [orderId]);
  const { data, loading, error } = useQuery(fetcher);

  const backToQueue = useCallback(() => {
    navigation.navigate('InspectionQueue');
  }, [navigation]);

  // Backing out of here would land on the last unit, whose buttons no longer
  // do anything.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        backToQueue();
        return true;
      });
      return () => subscription.remove();
    }, [backToQueue]),
  );

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Inspection Complete" />

      {loading && !data ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error || !data ? (
        <EmptyState
          icon="alert-triangle"
          title="Could not load the summary"
          hint={error?.message}
        />
      ) : (
        <View style={styles.content}>
          <View style={styles.check}>
            <Feather name="check" size={34} color={colors.success} />
          </View>

          <Text style={type.title}>Inspection complete</Text>
          <Text style={[type.numeric, styles.code]}>{data.orderCode}</Text>

          <Card style={styles.card}>
            <InfoRow
              icon="check-circle"
              label="Passed"
              subLabel={`${data.passed} ${data.passed === 1 ? 'repeat' : 'repeats'} — moved forward`}
              tone="success"
              divider={data.returned > 0}
            />
            {data.returned > 0 ? (
              <InfoRow
                icon="corner-up-left"
                label="Returned to Client"
                subLabel={`${data.returned} ${data.returned === 1 ? 'item' : 'items'} — Order Taker will return ${data.returned === 1 ? 'it' : 'them'}`}
                tone="danger"
              />
            ) : null}
          </Card>

          <Text style={[type.caption, styles.footnote]}>
            This order moves to Floor Manager for a job card once every color clears
            inspection.
          </Text>
        </View>
      )}

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, spacing.content) },
        ]}
      >
        <Button label="Back to Queue" flex onPress={backToQueue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loader: {
    marginTop: spacing.content * 3,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.content,
    gap: spacing.tight,
  },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.content * 2,
    marginBottom: spacing.tight,
  },
  code: {
    color: colors.primary,
  },
  card: {
    alignSelf: 'stretch',
    marginTop: spacing.block,
  },
  footnote: {
    textAlign: 'center',
    marginTop: spacing.block,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.content,
    paddingTop: spacing.tight + 2,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
  },
});
