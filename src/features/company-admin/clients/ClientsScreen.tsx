import { useCallback } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useQuery } from '../../../data/useQuery';
import { formatRs } from '../../../lib/ledgerMath';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { RosterScreen } from '../RosterScreen';
import type { RosterEntry } from '../components';
import {
  BILLING_TYPE_LABELS,
  PAYMENT_CYCLE_LABELS,
  listClients,
  type AdminClient,
} from '../rosters';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'Clients'>;

/**
 * A client with no terms yet is the normal case, not a broken row.
 *
 * The Order Taker creates clients mid-intake with a name, a phone and a photo;
 * the billing type, rate and cycle arrive here afterwards. So the pill and the
 * sub-line both have to say "not set yet" rather than render a blank or a zero
 * that reads as free work.
 */
function toEntry(client: AdminClient): RosterEntry {
  const terms = client.billing_type
    ? [
        client.rate === null ? 'No rate' : formatRs(client.rate),
        client.payment_cycle
          ? `paid ${PAYMENT_CYCLE_LABELS[client.payment_cycle].toLowerCase()}`
          : 'no payment cycle',
      ].join(' · ')
    : 'No billing terms set';

  return {
    id: client.id,
    name: client.name,
    pill: client.billing_type ? BILLING_TYPE_LABELS[client.billing_type] : 'No terms',
    subLabel: `${client.phone} · ${terms}`,
    active: client.status === 'active',
  };
}

export function ClientsScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(() => listClients(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const clients = data ?? [];

  return (
    <RosterScreen
      title="Clients"
      addLabel="Add Client"
      entries={clients.map(toEntry)}
      loading={loading}
      error={error}
      emptyHint="The same list the Order Taker picks from — setting terms here is what gives an order a price."
      onBack={navigation.goBack}
      onAdd={() => navigation.navigate('ClientForm', {})}
      onOpen={(id) => {
        const client = clients.find((entry) => entry.id === id);
        if (client) navigation.navigate('ClientForm', { client });
      }}
    />
  );
}
