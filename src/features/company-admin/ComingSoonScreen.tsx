import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, TopBar } from '../../components';
import { colors } from '../../theme';
import type { CompanyAdminStackParamList } from '../../navigation/CompanyAdminStack';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'ComingSoon'>;

/**
 * The rosters this role owns but has no specced form for yet.
 *
 * `0010_company_admin.sql` created `employees`, `finishing_partners`,
 * `suppliers` and `bonus_slabs` and gave company_admin write on all four, but a
 * write grant is not a screen design. Landing here names the destination
 * honestly instead of guessing at a form nobody has drawn.
 */
export function CompanyAdminComingSoonScreen({ navigation, route }: Props) {
  const { title, note } = route.params;

  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title={title} onPressBack={navigation.goBack} />
      <View style={styles.body}>
        <EmptyState
          icon="tool"
          title={`${title} — coming soon`}
          hint={note ?? 'This screen has not been specified yet.'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
});
