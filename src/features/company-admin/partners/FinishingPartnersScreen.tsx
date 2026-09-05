import { useCallback } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useQuery } from '../../../data/useQuery';
import { formatRs } from '../../../lib/ledgerMath';
import { useSession } from '../../../state/session';
import type { CompanyAdminStackParamList } from '../../../navigation/CompanyAdminStack';
import { RosterScreen } from '../RosterScreen';
import type { RosterEntry } from '../components';
import {
  FINISHING_STAGE_LABELS,
  listFinishingPartners,
  type FinishingPartner,
} from '../rosters';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'FinishingPartners'>;

/** Verbatim, and not to be paraphrased. */
const FOOTNOTE =
  "External businesses/individuals contracted per finishing stage — separate from Employees since they're not staff. Handoff/return, SLA tracking, and their own earnings ledger and payment history aren't built yet; this screen is their roster only.";

function toEntry(partner: FinishingPartner): RosterEntry {
  return {
    id: partner.id,
    name: partner.name,
    pill: FINISHING_STAGE_LABELS[partner.stage_type],
    subLabel: `${partner.contact ?? 'No contact'} · ${formatRs(partner.rate)}/repeat`,
    active: partner.status === 'active',
  };
}

export function FinishingPartnersScreen({ navigation }: Props) {
  const factoryId = useSession((state) => state.profile?.factory_id);

  const fetcher = useCallback(
    () => listFinishingPartners(factoryId as string),
    [factoryId],
  );
  const { data, loading, error } = useQuery(fetcher, Boolean(factoryId));

  const partners = data ?? [];

  return (
    <RosterScreen
      title="Finishing Partners"
      addLabel="Add Finishing Partner"
      entries={partners.map(toEntry)}
      loading={loading}
      error={error}
      footnote={FOOTNOTE}
      emptyHint="Clipping, piko and press are contracted out; this is who does them."
      onBack={navigation.goBack}
      onAdd={() => navigation.navigate('FinishingPartnerForm', {})}
      onOpen={(id) => {
        const partner = partners.find((entry) => entry.id === id);
        if (partner) navigation.navigate('FinishingPartnerForm', { partner });
      }}
    />
  );
}
