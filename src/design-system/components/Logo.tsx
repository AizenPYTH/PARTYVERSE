import Svg, { Circle, Line } from 'react-native-svg';

import { colors } from '../tokens';

/** "Constellation": three players around a shared center (handoff 1b). */
export function Logo({ size = 64, monochrome = false }: { size?: number; monochrome?: boolean }) {
  const line = monochrome ? colors.midnight : colors.violet;
  const top = monochrome ? colors.midnight : colors.violet;
  const left = monochrome ? colors.midnight : colors.blue;
  const right = monochrome ? colors.midnight : colors.textPrimary;
  const center = monochrome ? colors.midnight : colors.textPrimary;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityRole="image" accessibilityLabel="PARTYVERSE">
      <Line x1={32} y1={12} x2={12} y2={46} stroke={line} strokeWidth={3} />
      <Line x1={32} y1={12} x2={52} y2={46} stroke={line} strokeWidth={3} />
      <Line x1={12} y1={46} x2={52} y2={46} stroke={line} strokeWidth={3} />
      <Circle cx={32} cy={12} r={8} fill={top} />
      <Circle cx={12} cy={46} r={8} fill={left} />
      <Circle cx={52} cy={46} r={8} fill={right} />
      {/* The center dot is removed below 48 px. */}
      {size >= 48 ? <Circle cx={32} cy={35} r={4} fill={center} /> : null}
    </Svg>
  );
}
