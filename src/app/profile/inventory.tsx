import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ErrorState, ListSkeleton, Screen, SectionHeader, Text, colors } from '@/design-system';
import { ownsCosmetic, type Cosmetic } from '@/features/profile/api';
import { RARITY, RarityDiamond } from '@/features/profile/components/CollectionPreview';
import { useCosmetics, useInventory } from '@/features/profile/hooks';
import { errorMessage } from '@/lib/errors';

const KIND_LABELS: Record<Cosmetic['kind'], string> = {
  avatar: 'Avatars',
  title: 'Titres',
  frame: 'Cadres',
  badge: 'Badges',
  theme: 'Thèmes',
  victory_effect: 'Effets de victoire',
};

/** Server-owned inventory: items are granted by the server, never by the client. */
export default function InventoryScreen() {
  const cosmetics = useCosmetics();
  const inventory = useInventory();
  const error = cosmetics.error ?? inventory.error;

  const groups = new Map<Cosmetic['kind'], Cosmetic[]>();
  for (const item of cosmetics.data ?? []) groups.set(item.kind, [...(groups.get(item.kind) ?? []), item]);

  return (
    <Screen gap={20}>
      <ScreenHeader title="Inventaire" />
      {error ? <ErrorState message={errorMessage(error)} /> : null}
      {cosmetics.isPending || inventory.isPending ? <ListSkeleton rows={3} /> : null}
      {inventory.data
        ? [...groups.entries()].map(([kind, items]) => (
            <View key={kind} style={styles.section}>
              <SectionHeader
                title={KIND_LABELS[kind]}
                accent={{ text: `${items.filter((item) => ownsCosmetic(item, inventory.data)).length}/${items.length}`, color: colors.textSecondary }}
              />
              <View style={styles.grid}>
                {items.map((item) => (
                  <View key={item.id} style={styles.item}>
                    <RarityDiamond item={item} owned={ownsCosmetic(item, inventory.data)} />
                    <Text variant="meta" align="center" numberOfLines={2}>
                      {item.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        : null}
      <Text variant="caption" color={colors.textTertiary}>
        {`Raretés : ${Object.values(RARITY)
          .map((rarity) => rarity.label)
          .join(' · ')}. Les objets s’obtiennent en jouant ; aucun achat ne donne d’avantage en partie.`}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 },
  item: { width: '25%', alignItems: 'center', gap: 6 },
});
