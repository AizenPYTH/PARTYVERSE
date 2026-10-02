import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '../tokens';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Vertical gap between sections (22 on Home/Profile, 18 on Catalog/Friends). */
  gap?: number;
  edges?: Edge[];
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Leaves room for the floating tab bar. */
  withTabBar?: boolean;
}

export function Screen({
  children,
  scroll = true,
  gap = 22,
  edges = ['top', 'left', 'right'],
  refreshing,
  onRefresh,
  footer,
  contentStyle,
  withTabBar = false,
}: ScreenProps) {
  const content = [styles.content, { gap, paddingBottom: withTabBar ? 120 : 32 }, contentStyle];
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.violet} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[content, styles.fill]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.midnight },
  content: { paddingHorizontal: spacing.screen, paddingTop: 6 },
  fill: { flex: 1 },
  footer: { paddingHorizontal: spacing.screen, paddingBottom: 12, paddingTop: 8, backgroundColor: colors.midnight },
});
