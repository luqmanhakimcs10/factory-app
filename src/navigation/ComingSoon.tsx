import { StyleSheet, View } from 'react-native';

import { EmptyState, TopBar } from '../components';
import { colors } from '../theme';

interface ComingSoonProps {
  title: string;
  hint?: string;
  onPressBack?: () => void;
}

/**
 * Placeholder body for a stack whose screens are not built yet. Both feature
 * stacks render one of these until their real screens land.
 */
export function ComingSoon({ title, hint, onPressBack }: ComingSoonProps) {
  return (
    <View style={styles.screen}>
      <TopBar variant="bar" title={title} onPressBack={onPressBack} />
      <View style={styles.content}>
        <EmptyState
          icon="tool"
          title="Coming soon"
          hint={hint ?? 'This module is not built yet.'}
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
  content: {
    flex: 1,
    justifyContent: 'center',
  },
});
