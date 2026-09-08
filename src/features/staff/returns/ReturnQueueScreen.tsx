import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { CodeChip, EmptyState, StatusPill, TopBar } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { StaffStackParamList } from '../../../navigation/StaffStack';
import { listReturnRequests, type ReturnRequest } from '../api';

type Props = NativeStackScreenProps<StaffStackParamList, 'ReturnQueue'>;

/**
 * Sheets that have to go back to the client, and the ones that already did.
 *
 * The rows here are `return_requests`, not order alerts. Inspection raises both
 * when it rejects a unit: `orders.alert_text` is the Order Taker's banner and
 * this is the workflow object — one is a notification, the other is a job with
 * a photo and a completion. Confirming a return is what clears the banner, so
 * the two cannot drift apart.
 */
export function ReturnQueueScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(() => listReturnRequests(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const requests = data ?? [];
  const pending = requests.filter((request) => request.status === 'pending');
  const returned = requests.filter((request) => request.status === 'returned');

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title="Order Return" onPressBack={navigation.goBack} />

      <ScrollView contentContainerStyle={styles.content}>
        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : error ? (
          <EmptyState icon="alert-triangle" title="Could not load returns" hint={error.message} />
        ) : (
          <>
            <Text style={type.heading}>Damaged Sheets</Text>
            {pending.length === 0 ? (
              <EmptyState
                icon="check-circle"
                title="Nothing to return"
                hint="QA raises a return here when it rejects a sheet."
              />
            ) : (
              pending.map((request) => (
                <ReturnCard
                  key={request.id}
                  request={request}
                  onPress={() =>
                    navigation.navigate('RaiseReturn', { returnRequestId: request.id })
                  }
                />
              ))
            )}

            {returned.length > 0 ? (
              <>
                <Text style={[type.heading, styles.sectionGap]}>Returned to Client</Text>
                {returned.map((request) => (
                  <ReturnCard
                    key={request.id}
                    request={request}
                    onPress={() =>
                      navigation.navigate('RaiseReturn', { returnRequestId: request.id })
                    }
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ReturnCard({ request, onPress }: { request: ReturnRequest; onPress: () => void }) {
  const done = request.status === 'returned';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHead}>
        <Text style={type.code} numberOfLines={1}>
          {request.orders?.code ?? '—'}
        </Text>
        <StatusPill
          status={done ? 'passed' : 'returned'}
          label={done ? 'Returned' : 'Return Request'}
        />
      </View>

      <View style={styles.titleRow}>
        <Text style={type.bodyStrong} numberOfLines={1}>
          {request.orders?.clients?.name ?? 'Unknown client'}
        </Text>
        <Feather name="chevron-right" size={20} color={colors.textMuted} />
      </View>

      <View style={styles.codes}>
        {request.return_request_sheets.map((sheet) => (
          <CodeChip
            key={sheet.id}
            code={sheet.repeat_code}
            state={done ? 'default' : 'damaged'}
          />
        ))}
      </View>

      <Text style={type.caption}>
        {done && request.returned_at
          ? `Returned ${new Date(request.returned_at).toLocaleDateString()}`
          : `Raised ${new Date(request.raised_at).toLocaleDateString()}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.content,
    gap: spacing.block,
  },
  loader: {
    marginTop: spacing.content * 2,
  },
  sectionGap: {
    marginTop: spacing.tight,
  },
  card: {
    padding: spacing.content - 2,
    gap: spacing.tight,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.tight,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.tight,
  },
  codes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight - 2,
  },
});
