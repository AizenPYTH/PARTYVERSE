import { Chess, type Square } from 'chess.js';
import { Pressable, StyleSheet, Text as RNText, View, useWindowDimensions } from 'react-native';

import { colors, tint } from '@/design-system';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
// Solid glyphs for both colors + U+FE0E to force text (not emoji) presentation.
const GLYPHS: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAMES: Record<string, string> = { k: 'roi', q: 'dame', r: 'tour', b: 'fou', n: 'cavalier', p: 'pion' };

export interface ChessBoardProps {
  fen: string;
  orientation: 'w' | 'b';
  selected?: string | null;
  targets?: string[];
  lastMove?: { from: string; to: string } | null;
  interactive?: boolean;
  onSquarePress?: (square: string) => void;
  size?: number;
}

export function ChessBoard({ fen, orientation, selected, targets = [], lastMove, interactive = false, onSquarePress, size }: ChessBoardProps) {
  const { width } = useWindowDimensions();
  const boardSize = size ?? Math.min(width - 40, 440);
  const cell = Math.floor(boardSize / 8);
  const game = new Chess(fen);
  const board = game.board();
  const checkSquare = game.inCheck()
    ? board.flat().find((piece) => piece?.type === 'k' && piece.color === game.turn())?.square
    : undefined;
  const palette = tint(295);
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'w' ? FILES : [...FILES].reverse();

  return (
    <View style={[styles.board, { width: cell * 8, height: cell * 8 }]} accessibilityLabel="Échiquier">
      {ranks.map((rank) => (
        <View key={rank} style={styles.row}>
          {files.map((file) => {
            const square = `${file}${rank}`;
            const piece = game.get(square as Square);
            const dark = (FILES.indexOf(file) + rank) % 2 === 1;
            const isTarget = targets.includes(square);
            const highlight =
              square === selected
                ? colors.violetSoft
                : square === checkSquare
                  ? 'rgba(255,92,114,0.45)'
                  : lastMove && (square === lastMove.from || square === lastMove.to)
                    ? 'rgba(255,181,71,0.32)'
                    : null;
            return (
              <Pressable
                key={square}
                testID={`chess-${square}`}
                accessibilityRole="button"
                accessibilityLabel={`${square}${piece ? `, ${NAMES[piece.type]} ${piece.color === 'w' ? 'blanc' : 'noir'}` : ''}${isTarget ? ', coup possible' : ''}`}
                disabled={!interactive}
                onPress={() => onSquarePress?.(square)}
                style={[styles.square, { width: cell, height: cell, backgroundColor: dark ? palette.deep : palette.pattern }]}
              >
                {highlight ? <View style={[StyleSheet.absoluteFill, { backgroundColor: highlight }]} /> : null}
                {piece ? (
                  <RNText
                    allowFontScaling={false}
                    style={[
                      styles.piece,
                      { fontSize: cell * 0.78, lineHeight: cell * 0.95 },
                      piece.color === 'w' ? styles.white : styles.black,
                    ]}
                  >
                    {`${GLYPHS[piece.type]}︎`}
                  </RNText>
                ) : null}
                {isTarget ? (
                  piece ? (
                    <View style={[StyleSheet.absoluteFill, styles.captureRing, { borderRadius: cell / 2 }]} />
                  ) : (
                    <View style={[styles.dot, { width: cell * 0.28, height: cell * 0.28, borderRadius: cell * 0.14 }]} />
                  )
                ) : null}
                {file === files[0] ? <RNText style={[styles.coord, styles.rankCoord]}>{rank}</RNText> : null}
                {rank === ranks[7] ? <RNText style={[styles.coord, styles.fileCoord]}>{file}</RNText> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  square: { alignItems: 'center', justifyContent: 'center' },
  piece: { textAlign: 'center', includeFontPadding: false },
  white: { color: colors.textPrimary, textShadowColor: colors.midnight, textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 } },
  black: { color: colors.midnight, textShadowColor: 'rgba(244,242,250,0.55)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 } },
  dot: { position: 'absolute', backgroundColor: 'rgba(62,230,168,0.75)' },
  captureRing: { borderWidth: 3, borderColor: 'rgba(62,230,168,0.85)' },
  coord: { position: 'absolute', fontSize: 9, color: 'rgba(244,242,250,0.55)', fontFamily: 'Manrope_700Bold' },
  rankCoord: { top: 2, left: 3 },
  fileCoord: { bottom: 1, right: 3 },
});
