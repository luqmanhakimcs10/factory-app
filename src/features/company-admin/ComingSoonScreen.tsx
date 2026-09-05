import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, TopBar } from '../../components';
import { colors } from '../../theme';
import type { CompanyAdminStackParamList } from '../../navigation/CompanyAdminStack';

type Props = NativeStackScreenProps<CompanyAdminStackParamList, 'ComingSoon'>;

/**
 * The one destination in this module with nothing behind it: the bell.
 *
 * It used to catch the five unbuilt roster and report screens as well. Those
 * are built, so the only caller left is the dashboard's notifications button —
 * there is no notifications table for it to count, and saying so is more honest
 * than a bell that silently does nothing.
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
