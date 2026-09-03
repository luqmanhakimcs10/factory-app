import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState, TopBar } from '../../components';
import { colors } from '../../theme';
import type { StoreManagerStackParamList } from '../../navigation/StoreManagerStack';

type Props = NativeStackScreenProps<StoreManagerStackParamList, 'ComingSoon'>;

/**
 * Every entry point in this module that has no screenshot behind it lands here.
 *
 * A labelled placeholder rather than an invented form: the Store Manager spec
 * came from six static list screenshots, and guessing at a stock-adjustment or
 * audit-taking flow would bake in decisions nobody has made.
 */
export function ComingSoonScreen({ navigation, route }: Props) {
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
