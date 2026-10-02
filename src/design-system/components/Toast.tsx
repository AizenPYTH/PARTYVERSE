import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii } from '../tokens';
import { Button } from './Button';
import { Text } from './Text';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  detail?: string;
  tone?: ToastTone;
  action?: { label: string; onPress: () => void };
  /** Defaults to 6 s (design handoff). */
  durationMs?: number;
}

interface ToastEntry extends ToastOptions {
  id: number;
}

const ToastContext = createContext<{ show: (options: ToastOptions) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((options: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    const entry = { ...options, id: Date.now() };
    setToast(entry);
    timer.current = setTimeout(() => setToast((current) => (current?.id === entry.id ? null : current)), options.durationMs ?? 6000);
  }, []);

  const value = useMemo(() => ({ show }), [show]);
  const accent = toast?.tone === 'error' ? colors.coral : toast?.tone === 'success' ? colors.mint : colors.border;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInUp.duration(200)}
          exiting={FadeOutUp.duration(160)}
          style={[styles.wrap, { top: insets.top + 8 }]}
          pointerEvents="box-none"
        >
          <View style={[styles.toast, { borderColor: accent }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <View style={styles.text}>
              <Text variant="itemSm" color={toast.tone === 'error' ? colors.coral : colors.textPrimary}>
                {toast.message}
              </Text>
              {toast.detail ? (
                <Text variant="caption" color={colors.textSecondary}>
                  {toast.detail}
                </Text>
              ) : null}
            </View>
            {toast.action ? (
              <Button
                label={toast.action.label}
                size="S"
                onPress={() => {
                  toast.action?.onPress();
                  setToast(null);
                }}
              />
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 1000 },
  toast: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: { flex: 1, gap: 2 },
});
