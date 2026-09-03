import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, TopBar } from '../../../components';
import { colors } from '../../../theme';
import type { FloorManagerStackParamList } from '../../../navigation/FloorManagerStack';

type Props = NativeStackScreenProps<FloorManagerStackParamList, 'ComingSoon'>;

/**
 * Placeholder for the three dashboard cards that are explicitly future work:
 * Completed Orders, Shifts (worker/machine shift management, panel photos,
 * bonus calculation) and Damages.
 */
export function ComingSoonScreen({ navigation, route }: Props) {
  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title={route.params.title} onPressBack={navigation.goBack} />
      <View style={styles.body}>
        <EmptyState
          icon="tool"
          title="Coming soon"
          hint="This part of the Floor Manager module has not been specified yet."
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
