import { useCallback } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useQuery } from '../../../data/useQuery';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { RosterScreen } from '../RosterScreen';
import type { RosterEntry } from '../components';
import {
  INVENTORY_TYPE_LABELS,
  PAYMENT_CYCLE_LABELS,
  listSuppliers,
  type Supplier,
} from '../rosters';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'Suppliers'>;

/**
 * No price anywhere on this roster, and that is the design.
 *
 * What a supplier charges is per line on a purchase order (`po_items.price`),
 * not a property of the supplier — the same thread costs different money in
 * different weeks. A rate here would be a second, staler answer to a question
 * the Store Manager's PO already answers.
 */
function toEntry(supplier: Supplier): RosterEntry {
  return {
    id: supplier.id,
    name: supplier.name,
    pill: INVENTORY_TYPE_LABELS[supplier.inventory_type],
    subLabel: `${supplier.contact ?? 'No contact'} · Paid ${PAYMENT_CYCLE_LABELS[
      supplier.payment_cycle
    ].toLowerCase()}`,
    active: supplier.status === 'active',
  };
}

export function SuppliersScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(() => listSuppliers(factoryId as string), [factoryId]);
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const suppliers = data ?? [];

  return (
    <RosterScreen
      title="Suppliers"
      addLabel="Add Supplier"
      entries={suppliers.map(toEntry)}
      loading={loading}
      error={error}
      emptyHint="Who the factory buys thread, tilla, sequin and bobbin from."
      onBack={navigation.goBack}
      onAdd={() => navigation.navigate('SupplierForm', {})}
      onOpen={(id) => {
        const supplier = suppliers.find((entry) => entry.id === id);
        if (supplier) navigation.navigate('SupplierForm', { supplier });
      }}
    />
  );
}
