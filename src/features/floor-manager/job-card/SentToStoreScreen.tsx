import { useCallback } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, Card, MaterialRow, TopBar } from '../../../components';
import { colors, layout, spacing, type } from '../../../theme';
import { getSwatch } from '../../../data/swatches';
import { useQuery } from '../../../data/useQuery';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';
import { getFloorOrder } from '../api';
import { useHomeTab } from '../homeTabStore';
import { useJobCard } from './jobCardStore';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'JobCardSentToStore'>;

/** Terminal screen of the job-card flow. */
export function SentToStoreScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const clearJobCard = useJobCard((state) => state.clear);
  const setActiveTab = useHomeTab((state) => state.setActiveTab);

  const fetcher = useCallback(() => getFloorOrder(orderId), [orderId]);
  const { data: order } = useQuery(fetcher);

  const backToQueue = useCallback(() => {
    // Exit point of the sub-flow: drop the draft, and land back on the tab this
    // flow belongs to rather than resetting the queue to "All".
    clearJobCard();
    setActiveTab('jobcards');
    navigation.navigate('Home');
  }, [clearJobCard, navigation, setActiveTab]);

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
      <TopBar variant="bar" title="Materials Requested" trailing={order?.code} />

      <View style={styles.content}>
        <View style={styles.check}>
          <Feather name="send" size={28} color={colors.primary} />
        </View>
        <Text style={type.title}>Materials Requested</Text>
        <Text style={[type.label, styles.centered]}>Sent to Store Manager.</Text>

        <Card style={styles.card} title="Requested">
          {(order?.materials ?? []).map((entry) => (
            <MaterialRow
              key={entry.color_id}
              colorId={entry.color_id}
              label={getSwatch(entry.color_id)?.label ?? entry.color_id}
              quantity={`${entry.qty_grams} g`}
            />
          ))}
        </Card>
      </View>

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
  content: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.content,
    gap: spacing.hair,
  },
  check: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.neutralAccent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.content,
    marginBottom: spacing.tight,
  },
  centered: {
    textAlign: 'center',
  },
  card: {
    alignSelf: 'stretch',
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
