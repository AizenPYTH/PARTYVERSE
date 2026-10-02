import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { SectionHeader, Text, colors } from '@/design-system';

import { ownsCosmetic, type Cosmetic } from '../api';
import { useCosmetics } from '../hooks';

export const RARITY = {
  legendary: { label: 'Légendaire', color: colors.amber },
  epic: { label: 'Épique', color: colors.violet },
  rare: { label: 'Rare', color: colors.blue },
  common: { label: 'Commun', color: colors.textSecondary },
} as const;

/** Rarity diamonds (design 1j). The rarity label always accompanies the color. */
export function RarityDiamond({ item, owned }: { item: Cosmetic; owned: boolean }) {
  const rarity = RARITY[item.rarity];
  return (
    <View style={styles.cell} accessibilityLabel={`${item.name}, ${rarity.label}${owned ? '' : ', verrouillé'}`}>
      <View style={styles.diamondWrap}>
        <View
          style={[
            styles.diamond,
            owned ? { backgroundColor: rarity.color } : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong },
          ]}
        />
        <Text variant="itemSm" color={owned ? colors.onAccent : colors.textTertiary} style={styles.glyph}>
          {owned ? item.name.slice(0, 2).toUpperCase() : '?'}
        </Text>
      </View>
      <Text variant="metaBold" color={owned ? rarity.color : colors.textTertiary} align="center" numberOfLines={1}>
        {owned ? rarity.label.toUpperCase() : item.unlock_rule.level ? `NIV. ${item.unlock_rule.level}` : 'VERROUILLÉ'}
      </Text>
    </View>
  );
}

export function CollectionPreview({ inventory }: { inventory: string[] }) {
  const cosmetics = useCosmetics();
  const items = (cosmetics.data ?? []).filter((item) => item.rarity !== 'common');
  const owned = items.filter((item) => ownsCosmetic(item, inventory));
  const preview = [...owned, ...items.filter((item) => !ownsCosmetic(item, inventory))].slice(0, 4);
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader
        title="Collection"
        accent={{ text: `${owned.length}/${items.length}`, color: colors.textSecondary }}
        actionLabel="Tout voir"
        onAction={() => router.push('/profile/inventory')}
      />
      <View style={styles.row}>
        {preview.map((item) => (
          <RarityDiamond key={item.id} item={item} owned={ownsCosmetic(item, inventory)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { width: 78, alignItems: 'center', gap: 14 },
  diamondWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  diamond: { position: 'absolute', width: 54, height: 54, borderRadius: 14, transform: [{ rotate: '45deg' }] },
  glyph: { fontFamily: 'Unbounded_600SemiBold' },
});
