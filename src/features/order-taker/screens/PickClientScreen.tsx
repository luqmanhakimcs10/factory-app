import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';

import { Button, EmptyState } from '../../../components';
import { colors, layout, radius, spacing, type } from '../../../theme';
import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { OrderTakerStackParamList } from '../../../navigation/OrderTakerStack';
import { listClients } from '../api';
import { clientColorHex } from '../clientColor';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard } from '../wizardStore';

type Props = NativeStackScreenProps<OrderTakerStackParamList, 'PickClient'>;

/** Step 1. Both paths — new client and existing — advance to Sheet Count. */
export function PickClientScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);
  const selectedClientId = useWizard((state) => state.selectedClientId);
  const setSelectedClientId = useWizard((state) => state.setSelectedClientId);

  const fetcher = useCallback(() => listClients(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const pick = (clientId: string) => {
    setSelectedClientId(clientId);
    navigation.navigate('SheetCount');
  };

  return (
    <WizardLayout
      title="New Order"
      step={1}
      onBack={navigation.goBack}
      heading="Who is this order for?"
      subtext="Pick an existing client, or add a new one."
      footer={
        <Button
          label="Continue"
          flex
          disabled={!selectedClientId}
          onPress={() => navigation.navigate('SheetCount')}
        />
      }
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('NewClient')}
        style={styles.newTile}
      >
        <View style={styles.newIcon}>
          <Feather name="user-plus" size={20} color={colors.primary} />
        </View>
        <View style={styles.newText}>
          <Text style={type.bodyStrong}>New Client — Take Photo</Text>
          <Text style={type.label}>Photograph the shop and take a phone number</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </Pressable>

      {loading && !data ? (
        <ActivityIndicator color={colors.primary} />
      ) : error ? (
        <EmptyState icon="alert-triangle" title="Could not load clients" hint={error.message} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon="users"
          title="No clients yet"
          hint="Add the first one with New Client above."
        />
      ) : (
        <View style={styles.grid}>
          {data.map((client) => {
            const selected = client.id === selectedClientId;
            return (
              <Pressable
                key={client.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => pick(client.id)}
                style={[
                  styles.clientTile,
                  { backgroundColor: clientColorHex(client.id) },
                  selected && styles.clientTileSelected,
                ]}
              >
                <View style={styles.house}>
                  <Feather name="home" size={18} color={colors.surface} />
                </View>
                <Text style={[type.code, styles.onColorPhone]} numberOfLines={1}>
                  {client.phone}
                </Text>
                <Text style={[type.bodyStrong, styles.onColorName]} numberOfLines={1}>
                  {client.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </WizardLayout>
  );
}

const styles = StyleSheet.create({
  newTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight + 2,
    padding: spacing.content - 2,
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
  newIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.icon,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newText: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight + 2,
  },
  clientTile: {
    // Two per row: a 46% basis leaves room for the gap, flexGrow shares the
    // remainder so the pair always fills the width.
    flexGrow: 1,
    flexBasis: '46%',
    padding: spacing.content - 4,
    gap: 2,
    borderRadius: radius.tile,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  clientTileSelected: {
    borderWidth: 2.5,
    borderColor: colors.primary,
  },
  house: {
    width: 32,
    height: 32,
    borderRadius: 16,
    // A translucent white disc reads on every colour in the rotation, which a
    // fixed tint would not.
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.hair,
  },
  onColorPhone: {
    color: colors.surface,
    opacity: 0.85,
  },
  onColorName: {
    color: colors.surface,
  },
});
