import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  platformColors,
  platformRadius,
  platformSpacing,
  platformType,
} from '../../../theme-platform';
import { confirmDestructive, notify } from '../../../lib/alert';
import { useQuery } from '../../../data/useQuery';
import { useSignedPhoto } from '../../../data/useSignedPhoto';
import { BUCKETS } from '../../../data/storage';
import type { SuperAdminStackParamList } from '../../../navigation/SuperAdminStack';
import {
  InfoCell,
  PlatformButton,
  PlatformCard,
  PlatformTopBar,
  StatusBadge,
} from '../components';
import { FactoryFormModal } from '../modals/FactoryFormModal';
import { GenerateInvoiceModal } from '../modals/GenerateInvoiceModal';
import {
  formatDate,
  formatMoney,
  generateInvoice,
  getFactory,
  listFactoryModules,
  listModules,
  listPayments,
  monthlyExpenseFor,
  setFactoryStatus,
  setPaymentStatus,
  totalReceivableFor,
  updateFactory,
  type SubscriptionPayment,
} from '../api';

type Props = NativeStackScreenProps<SuperAdminStackParamList, 'PlatformFactoryDetail'>;

export function FactoryDetailScreen({ navigation, route }: Props) {
  const { factoryId } = route.params;
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [working, setWorking] = useState(false);

  const fetcher = useCallback(async () => {
    const [factory, payments, modules, enabledModuleIds] = await Promise.all([
      getFactory(factoryId),
      listPayments(factoryId),
      listModules(),
      listFactoryModules(factoryId),
    ]);
    return { factory, payments, modules, enabledModuleIds };
  }, [factoryId]);

  const { data, loading, error, refetch } = useQuery(fetcher);
  const cnicUrl = useSignedPhoto(BUCKETS.factoryDocs, data?.factory.cnic_photo_url);

  const share = () =>
    notify(
      'Sharing is not built yet',
      'Factory and invoice sharing still needs real document generation and a share sheet.',
    );

  const toggleStatus = async () => {
    if (!data) return;
    const goingInactive = data.factory.status === 'active';

    // The asymmetry is deliberate: deactivating cuts a tenant off, so it asks
    // first. Reactivating restores access and needs no ceremony.
    if (goingInactive) {
      const ok = await confirmDestructive(
        'Deactivate factory',
        `${data.factory.name} will be marked inactive.`,
        'Deactivate',
      );
      if (!ok) return;
    }

    setWorking(true);
    try {
      await setFactoryStatus(factoryId, goingInactive ? 'inactive' : 'active');
      await refetch();
    } catch (caught) {
      notify('Could not change the status', caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  const togglePayment = async (payment: SubscriptionPayment) => {
    setWorking(true);
    try {
      await setPaymentStatus(payment.id, payment.status === 'paid' ? 'pending' : 'paid');
      await refetch();
    } catch (caught) {
      notify('Could not update the payment', caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  if (loading && !data) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ActivityIndicator style={styles.loader} color={platformColors.accentPrimary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.empty}>
          <Text style={platformType.bodyStrong}>Could not load this factory</Text>
          <Text style={platformType.caption}>{error?.message ?? ''}</Text>
        </View>
      </View>
    );
  }

  const { factory, payments, modules, enabledModuleIds } = data;
  const active = factory.status === 'active';
  const moduleLabels = modules
    .filter((m) => enabledModuleIds.includes(m.id))
    .map((m) => m.label);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <PlatformTopBar title={factory.name} onPressBack={navigation.goBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.actionRow}>
          <PlatformButton
            label="Edit"
            icon="edit-2"
            tone="quiet"
            onPress={() => setEditing(true)}
            style={styles.flex}
          />
          <PlatformButton
            label="Share"
            icon="share-2"
            tone="quiet"
            onPress={share}
            style={styles.flex}
          />
          <PlatformButton
            label={active ? 'Deactivate' : 'Activate'}
            tone={active ? 'danger' : 'primary'}
            onPress={toggleStatus}
            loading={working}
            style={styles.flex}
          />
        </View>

        <PlatformCard>
          <View style={styles.grid}>
            <InfoCell label="Status" full>
              <StatusBadge status={factory.status} />
            </InfoCell>
            <InfoCell label="Responsible" value={factory.responsible_person ?? ''} />
            <InfoCell label="Phone" value={factory.phone_number ?? ''} />
            <InfoCell label="Address" value={factory.location ?? ''} full />
            <InfoCell label="CNIC" value={factory.cnic_number ?? ''} />
            <InfoCell label="Employees" value={factory.employees_count?.toString() ?? ''} />
            <InfoCell
              label="Subscription"
              value={factory.subscription_fee ? formatMoney(factory.subscription_fee) : ''}
            />
            <InfoCell label="Started" value={formatDate(factory.starting_date)} />
            <InfoCell label="Due" value={formatDate(factory.due_date)} />
            <InfoCell
              label="Receivable"
              value={formatMoney(totalReceivableFor(payments))}
            />
            <InfoCell label="Selected Modules" value={moduleLabels.join(', ')} full />
          </View>

          {factory.cnic_photo_url ? (
            cnicUrl ? (
              <Image source={{ uri: cnicUrl }} style={styles.cnic} resizeMode="cover" />
            ) : (
              <View style={[styles.cnic, styles.cnicLoading]}>
                <ActivityIndicator color={platformColors.textSecondary} />
              </View>
            )
          ) : null}
        </PlatformCard>

        <PlatformCard>
          <Text style={platformType.label}>Estimated Monthly Expense</Text>
          <Text style={platformType.bodyStrong}>{formatMoney(monthlyExpenseFor(factory))}</Text>
          <Text style={platformType.caption}>
            Placeholder — a flat 40% of the subscription fee, carried over from the
            source document, which gives no basis for it. Not cost accounting.
          </Text>
        </PlatformCard>

        <View style={styles.paymentsHeader}>
          <Text style={platformType.heading}>Payment History</Text>
          <PlatformButton
            label="Invoice"
            icon="plus"
            tone="secondary"
            onPress={() => setInvoicing(true)}
          />
        </View>

        {payments.length === 0 ? (
          <PlatformCard>
            <Text style={platformType.bodyStrong}>No invoices yet</Text>
            <Text style={platformType.caption}>
              Generate one to start this factory&apos;s billing history.
            </Text>
          </PlatformCard>
        ) : (
          payments.map((payment) => {
            const paid = payment.status === 'paid';
            const accent = paid ? platformColors.accentSuccess : platformColors.accentError;
            return (
              <PlatformCard key={payment.id} accentBorder={accent}>
                <View style={styles.paymentHeader}>
                  <Text style={platformType.bodyStrong}>
                    {/* A paid invoice shows when it settled; an outstanding one
                        shows what it is still due against. */}
                    {formatDate(paid ? payment.paid_date : payment.due_date)}
                  </Text>
                  <Text style={platformType.bodyStrong}>{formatMoney(payment.amount)}</Text>
                </View>
                <Text style={platformType.caption}>{payment.description}</Text>

                <View style={styles.paymentFooter}>
                  <View style={[styles.pill, { backgroundColor: `${accent}1a` }]}>
                    <Text style={[styles.pillText, { color: accent }]}>
                      {paid ? 'Paid' : 'Pending'}
                    </Text>
                  </View>
                  <View style={styles.paymentActions}>
                    <PlatformButton label="Share" tone="quiet" onPress={share} />
                    <PlatformButton
                      label={paid ? 'Mark Pending' : 'Mark Paid'}
                      tone="quiet"
                      onPress={() => void togglePayment(payment)}
                      disabled={working}
                    />
                  </View>
                </View>
              </PlatformCard>
            );
          })
        )}
      </ScrollView>

      <FactoryFormModal
        visible={editing}
        factory={factory}
        initialModuleIds={enabledModuleIds}
        modules={modules}
        onClose={() => setEditing(false)}
        onSubmit={async (draft) => {
          await updateFactory(factoryId, draft);
          await refetch();
        }}
      />

      <GenerateInvoiceModal
        visible={invoicing}
        factoryName={factory.name}
        suggestedAmount={factory.subscription_fee}
        onClose={() => setInvoicing(false)}
        onSubmit={async (args) => {
          await generateInvoice({ factoryId, ...args });
          await refetch();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: platformColors.bgApp },
  loader: { marginTop: platformSpacing.content * 3 },
  empty: { padding: platformSpacing.content, gap: platformSpacing.hair },
  content: { padding: platformSpacing.content, gap: platformSpacing.block },
  actionRow: { flexDirection: 'row', gap: platformSpacing.tight },
  flex: { flex: 1 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: platformSpacing.block,
    columnGap: platformSpacing.tight,
  },
  cnic: {
    width: '100%',
    height: 180,
    borderRadius: platformRadius.card,
    marginTop: platformSpacing.tight,
  },
  cnicLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: platformColors.bgApp,
  },
  paymentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: platformSpacing.tight,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: platformSpacing.tight,
  },
  paymentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: platformSpacing.tight,
    flexWrap: 'wrap',
  },
  paymentActions: { flexDirection: 'row', gap: platformSpacing.tight },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: platformRadius.badge,
  },
  pillText: { fontSize: 12, fontWeight: '700' },
});
