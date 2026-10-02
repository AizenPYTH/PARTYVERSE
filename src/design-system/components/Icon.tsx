import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '../tokens';

/**
 * 24 px grid, 1.8 stroke, round joins/caps, no fill (design handoff 1d).
 * `filled` renders the active navigation state.
 */
export type IconName =
  | 'home'
  | 'games'
  | 'friends'
  | 'activity'
  | 'profile'
  | 'bell'
  | 'search'
  | 'messages'
  | 'trophy'
  | 'settings'
  | 'invite'
  | 'leaderboard'
  | 'gift'
  | 'logout'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'check'
  | 'plus'
  | 'play'
  | 'menu'
  | 'copy'
  | 'share'
  | 'eye'
  | 'flag'
  | 'block'
  | 'lobbies'
  | 'bolt';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = colors.textPrimary, filled = false, strokeWidth = 1.8 }: IconProps) {
  const fill = filled ? color : 'none';
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {renderGlyph(name, fill)}
    </Svg>
  );
}

function renderGlyph(name: IconName, fill: string) {
  switch (name) {
    case 'home':
      return <Path d="M4 11l8-7 8 7v9h-5v-6h-6v6H4z" fill={fill} />;
    case 'games':
      return (
        <>
          <Rect x={4} y={4} width={7} height={7} rx={2} fill={fill} />
          <Rect x={13} y={4} width={7} height={7} rx={2} fill={fill} />
          <Rect x={4} y={13} width={7} height={7} rx={2} fill={fill} />
          <Circle cx={16.5} cy={16.5} r={3.5} fill={fill} />
        </>
      );
    case 'friends':
      return (
        <>
          <Circle cx={9} cy={8} r={3.5} fill={fill} />
          <Path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" fill={fill} />
          <Circle cx={17} cy={9} r={2.5} fill={fill} />
          <Path d="M17 14c2.5 0 4 2 4 5" />
        </>
      );
    case 'activity':
      return <Path d="M13 3L5 13h6l-1 8 8-10h-6z" fill={fill} />;
    case 'bolt':
      return <Path d="M13 3L5 13h6l-1 8 8-10h-6z" fill={fill} />;
    case 'profile':
      return (
        <>
          <Circle cx={12} cy={8} r={4} fill={fill} />
          <Path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill={fill} />
        </>
      );
    case 'bell':
      return (
        <>
          <Path d="M6 16v-5a6 6 0 0112 0v5l2 2H4z" fill={fill} />
          <Path d="M10 20a2 2 0 004 0" />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx={11} cy={11} r={6} />
          <Path d="M16 16l4 4" />
        </>
      );
    case 'messages':
      return <Path d="M4 6h16v10H9l-5 4z" fill={fill} />;
    case 'trophy':
      return (
        <>
          <Path d="M7 4h10v5a5 5 0 01-10 0z" fill={fill} />
          <Path d="M12 14v4M8 20h8" />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle cx={12} cy={12} r={3} fill={fill} />
          <Circle cx={12} cy={12} r={8} strokeDasharray="3.2 2.1" />
        </>
      );
    case 'invite':
      return (
        <>
          <Circle cx={10} cy={8} r={3.5} />
          <Path d="M3 20c0-3.5 3-6 7-6s7 2.5 7 6" />
          <Path d="M19 8v6M16 11h6" />
        </>
      );
    case 'leaderboard':
      return <Path d="M4 20V12h4v8M10 20V6h4v14M16 20v-5h4v5M3 20h18" />;
    case 'gift':
      return (
        <>
          <Rect x={4} y={9} width={16} height={11} rx={2} />
          <Path d="M12 9v11M4 13h16M12 9c-1.5-3-5-3-5-1s3 1 5 1zM12 9c1.5-3 5-3 5-1s-3 1-5 1z" />
        </>
      );
    case 'logout':
      return <Path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9" />;
    case 'chevron-left':
      return <Path d="M15 5l-7 7 7 7" />;
    case 'chevron-right':
      return <Path d="M9 5l7 7-7 7" />;
    case 'close':
      return <Path d="M6 6l12 12M18 6L6 18" />;
    case 'check':
      return <Path d="M5 12.5l4.5 4.5L19 7.5" />;
    case 'plus':
      return <Path d="M12 5v14M5 12h14" />;
    case 'play':
      return <Path d="M9 6.5v11l8.5-5.5z" fill={fill === 'none' ? undefined : fill} />;
    case 'menu':
      return <Path d="M5 8h14M5 16h14" />;
    case 'copy':
      return (
        <>
          <Rect x={8} y={8} width={12} height={12} rx={3} />
          <Path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
        </>
      );
    case 'share':
      return <Path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" />;
    case 'eye':
      return (
        <>
          <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <Circle cx={12} cy={12} r={3} />
        </>
      );
    case 'flag':
      return <Path d="M5 21V4M5 4h11l-2 4 2 4H5" />;
    case 'block':
      return (
        <>
          <Circle cx={12} cy={12} r={8} />
          <Path d="M6.5 17.5l11-11" />
        </>
      );
    case 'lobbies':
      return (
        <>
          <Path d="M5 20V6a2 2 0 012-2h10a2 2 0 012 2v14" />
          <Path d="M3 20h18M14 12h.01" />
        </>
      );
  }
}
