import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { tint } from '../color';
import { colors } from '../tokens';
import { PresenceDot, type PresenceKind } from './PresenceDot';
import { Text } from './Text';

export type AvatarRing = 'none' | 'ready' | 'profile';

export interface AvatarProps {
  size: number;
  /** Hue of the placeholder avatar (oklch(0.70 0.15 h)). */
  hue: number;
  initials: string;
  ring?: AvatarRing;
  /** 0..1 — XP progress ring around the avatar (home header). */
  progress?: number;
  presence?: PresenceKind;
  dimmed?: boolean;
  /** Pill or game glyph pinned to the avatar. */
  badge?: ReactNode;
  badgePosition?: 'top' | 'bottom-right';
  accessibilityLabel?: string;
}

export function Avatar({
  size,
  hue,
  initials,
  ring = 'none',
  progress,
  presence,
  dimmed = false,
  badge,
  badgePosition = 'bottom-right',
  accessibilityLabel,
}: AvatarProps) {
  const color = tint(hue).accent;
  const inset = ring === 'profile' ? 8 : ring === 'ready' ? 5 : progress !== undefined ? 5 : 0;
  const inner = size - inset * 2;

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? initials}
    >
      {ring === 'ready' ? <View style={[StyleSheet.absoluteFill, styles.readyRing, { borderRadius: size / 2 }]} /> : null}
      {ring === 'profile' ? <ProfileRing size={size} /> : null}
      {progress !== undefined ? <ProgressRing size={size} progress={progress} /> : null}
      <View
        style={[
          styles.circle,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            top: inset,
            left: inset,
            backgroundColor: color,
            opacity: dimmed ? 0.55 : 1,
          },
        ]}
      >
        <Text
          color={colors.onAccent}
          style={{ fontFamily: 'Unbounded_600SemiBold', fontSize: Math.max(10, inner * 0.32) }}
          allowFontScaling={false}
        >
          {initials.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      {presence ? (
        <View style={styles.presence}>
          <PresenceDot kind={presence} size={size >= 56 ? 16 : 14} />
        </View>
      ) : null}
      {badge ? <View style={badgePosition === 'top' ? styles.badgeTop : styles.badgeBottom}>{badge}</View> : null}
    </View>
  );
}

function ProgressRing({ size, progress }: { size: number; progress: number }) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={colors.violet}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference * clamped} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

function ProfileRing({ size }: { size: number }) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="pvProfileRing" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.violet} />
          <Stop offset="1" stopColor={colors.blue} />
        </LinearGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke="url(#pvProfileRing)" strokeWidth={stroke} fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  circle: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  readyRing: { borderWidth: 2, borderColor: colors.mint },
  presence: { position: 'absolute', right: -1, bottom: -1 },
  badgeTop: { position: 'absolute', top: -9, left: 0, right: 0, alignItems: 'center' },
  badgeBottom: { position: 'absolute', right: -6, bottom: -4 },
});
