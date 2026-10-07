import { AvatarFrame } from '@/components/cosmetics/AvatarFrame';
import { ProfileBanner } from '@/components/cosmetics/ProfileBanner';
import { Segmented } from '@/components/guild/LeaderboardPanel';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { Card } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { buyCosmetic, equipCosmetic, loadoutOf, type Cosmetic, type CosmeticKind, type OwnedCosmetic } from '@/lib/cosmetics';
import { rankFor, rankIndexOf, rewardPrice } from '@/lib/guilds';
import { getTheme, typography } from '@/lib/theme';
import { Check, Coins, Lock, Palette, Trophy } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, View } from 'react-native';

type Props = {
  isDark: boolean;
  index?: number;
  catalog: Cosmetic[];
  owned: OwnedCosmetic[];
  coins: number;
  lifetime: number;
  guildLevel: number;
  // Reload balance + ownership after a purchase or a change of outfit.
  onChanged: () => Promise<void> | void;
};

// "Classic" = nothing equipped; every user has it.
const CLASSIC = '__classic';

// Profile banners and avatar frames: preview, buy with coins, wear. Milestone
// items can't be bought; they arrive when the mission is claimed.
export function CosmeticsShop({ isDark, index = 0, catalog, owned, coins, lifetime, guildLevel, onChanged }: Props) {
  const { profile } = useAuth();
  const { primaryText, mutedText, mutedPanel } = getTheme(isDark);
  const [kind, setKind] = useState<CosmeticKind>('banner');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // What the preview shows when it differs from what's worn.
  const [preview, setPreview] = useState<{ banner?: string | null; frame?: string | null }>({});
  const rowRef = useRef<ScrollView>(null);

  // Each tab's list starts at its first item.
  useEffect(() => {
    rowRef.current?.scrollTo({ x: 0, animated: false });
  }, [kind]);

  const loadout = loadoutOf(owned);
  const ownedKeys = new Set(owned.map((item) => item.cosmetic_key));
  const { index: myRankIndex } = rankFor(lifetime);
  const items = catalog.filter((item) => item.kind === kind);
  const shownBanner = preview.banner !== undefined ? preview.banner : loadout.banner;
  const shownFrame = preview.frame !== undefined ? preview.frame : loadout.frame;

  async function wear(itemKind: CosmeticKind, key: string | null) {
    setBusyKey(key ?? CLASSIC);
    const { error } = await equipCosmetic(itemKind, key);
    setBusyKey(null);
    if (error) {
      Alert.alert('Could not change style', error.message);
      return;
    }
    setPreview({});
    await onChanged();
  }

  function confirmBuy(item: Cosmetic, price: number) {
    Alert.alert(`Buy ${item.name}?`, `This spends ${price} coins and puts it on your profile right away.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Buy',
        onPress: async () => {
          setBusyKey(item.key);
          const { error } = await buyCosmetic(item.key);
          if (error) {
            setBusyKey(null);
            Alert.alert('Could not buy', error.message);
            return;
          }
          await wear(item.kind, item.key);
        },
      },
    ]);
  }

  return (
    <Card index={index}>
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-[#7C3AED]">
          <Palette size={20} color="#FFFFFF" />
        </View>
        <View className="flex-1">
          <Text className={`${typography.sectionTitle} ${primaryText}`}>Profile Style</Text>
          <Text className={`text-xs ${mutedText}`}>Banners and frames everyone sees on your profile</Text>
        </View>
      </View>

      {/* Live preview */}
      <ProfileBanner bannerKey={shownBanner} height={92} className="mt-3 justify-center rounded-2xl px-4">
        <View className="flex-row items-center gap-3">
          <View className="h-14 w-14 items-center justify-center">
            <AvatarFrame frameKey={shownFrame} size={52}>
              <View className="h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#B7C4EC]">
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} className="h-full w-full" />
                ) : (
                  <Text className="text-xl font-bold text-[#24314A]">{profile?.display_name?.trim().charAt(0).toUpperCase() ?? ''}</Text>
                )}
              </View>
            </AvatarFrame>
          </View>
          <View className="flex-1">
            <Text className="text-base font-black text-white" numberOfLines={1}>
              {profile?.display_name ?? 'You'}
            </Text>
            <Text className="text-xs font-semibold text-white/80">Preview</Text>
          </View>
        </View>
      </ProfileBanner>

      <View className="mt-3">
        <Segmented
          isDark={isDark}
          small
          options={[
            { id: 'banner', label: 'Banners' },
            { id: 'frame', label: 'Frames' },
          ]}
          value={kind}
          onChange={(value) => setKind(value as CosmeticKind)}
        />
      </View>

      {/* One swipeable row right under the preview, so the preview stays in view while trying items. */}
      <ScrollView
        ref={rowRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-4 mt-3"
        contentContainerClassName="gap-3 px-4">
        <Tile
          key={CLASSIC}
          isDark={isDark}
          kind={kind}
          itemKey={null}
          name={kind === 'banner' ? 'Classic' : 'No frame'}
          selected={(kind === 'banner' ? shownBanner : shownFrame) === null}
          onPreview={() => setPreview((current) => ({ ...current, [kind]: null }))}>
          <ActionButton
            label={loadout[kind] === null ? 'Wearing' : 'Wear'}
            tone={loadout[kind] === null ? 'done' : 'primary'}
            busy={busyKey === CLASSIC}
            disabled={loadout[kind] === null || busyKey !== null}
            onPress={() => void wear(kind, null)}
            isDark={isDark}
          />
        </Tile>

        {items.map((item) => {
          const isOwned = ownedKeys.has(item.key);
          const isWorn = loadout[kind] === item.key;
          const rankLocked = !isOwned && item.min_rank !== null && myRankIndex < rankIndexOf(item.min_rank);
          const price = item.cost !== null ? rewardPrice(item.cost, lifetime, guildLevel) : null;
          let button;
          if (isWorn) {
            button = <ActionButton label="Wearing" tone="done" disabled isDark={isDark} />;
          } else if (isOwned) {
            button = <ActionButton label="Wear" tone="primary" busy={busyKey === item.key} disabled={busyKey !== null} onPress={() => void wear(kind, item.key)} isDark={isDark} />;
          } else if (price === null) {
            button = <ActionButton label="Milestone" tone="locked" icon="trophy" disabled isDark={isDark} />;
          } else if (rankLocked) {
            button = <ActionButton label={`${item.min_rank}+`} tone="locked" icon="lock" disabled isDark={isDark} />;
          } else {
            const affordable = coins >= price;
            button = (
              <ActionButton
                label={affordable ? `${price}` : `Need ${price - coins}`}
                tone={affordable ? 'buy' : 'locked'}
                icon="coins"
                busy={busyKey === item.key}
                disabled={!affordable || busyKey !== null}
                onPress={() => confirmBuy(item, price)}
                isDark={isDark}
              />
            );
          }
          return (
            <Tile
              key={item.key}
              isDark={isDark}
              kind={kind}
              itemKey={item.key}
              name={item.name}
              note={!isOwned && price === null ? item.description : null}
              selected={(kind === 'banner' ? shownBanner : shownFrame) === item.key}
              onPreview={() => setPreview((current) => ({ ...current, [kind]: item.key }))}>
              {button}
            </Tile>
          );
        })}
      </ScrollView>

      <View className={`mt-3 rounded-xl px-3 py-2 ${mutedPanel}`}>
        <Text className={`text-[11px] ${mutedText}`}>Swipe to see more. Tap any item to preview it. Milestone items unlock from the Missions tab.</Text>
      </View>
    </Card>
  );
}

function Tile({
  isDark,
  kind,
  itemKey,
  name,
  note = null,
  selected,
  onPreview,
  children,
}: {
  isDark: boolean;
  kind: CosmeticKind;
  itemKey: string | null;
  name: string;
  note?: string | null;
  selected: boolean;
  onPreview: () => void;
  children: React.ReactNode;
}) {
  const primaryText = isDark ? 'text-white' : 'text-[#182847]';
  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  return (
    <AnimatedPressable
      onPress={onPreview}
      className={`w-36 rounded-2xl border-2 p-2 ${isDark ? 'bg-[#0F1A2C]' : 'bg-[#F8FAFD]'}`}
      style={{ borderColor: selected ? '#7C3AED' : isDark ? '#22324B' : '#E9EDF5' }}>
      {kind === 'banner' ? (
        <ProfileBanner key="banner" bannerKey={itemKey} height={52} className="rounded-xl" />
      ) : (
        <View key="frame" className={`h-[52px] items-center justify-center rounded-xl ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF2FA]'}`}>
          <AvatarFrame frameKey={itemKey} size={36}>
            <View className="h-9 w-9 rounded-full bg-[#B7C4EC]" />
          </AvatarFrame>
        </View>
      )}
      <Text className={`mt-1.5 text-center text-[13px] font-bold ${primaryText}`} numberOfLines={1}>
        {name}
      </Text>
      {note ? (
        <Text className={`text-center text-[10px] ${mutedText}`} numberOfLines={2}>
          {note}
        </Text>
      ) : null}
      {/* mt-auto pins the button to the bottom so buttons line up across a row */}
      <View className="mt-auto pt-1.5">{children}</View>
    </AnimatedPressable>
  );
}

const TONES = {
  primary: { bg: '#284BD6', text: '#FFFFFF' },
  buy: { bg: '#FBBF24', text: '#422006' },
  done: { bg: '#10B981', text: '#FFFFFF' },
} as const;

function ActionButton({
  label,
  tone,
  icon,
  busy = false,
  disabled = false,
  onPress,
  isDark,
}: {
  label: string;
  tone: keyof typeof TONES | 'locked';
  icon?: 'coins' | 'lock' | 'trophy';
  busy?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  isDark: boolean;
}) {
  const colors = tone === 'locked' ? { bg: isDark ? '#22324B' : '#E2E8F0', text: isDark ? '#94A3B8' : '#64748B' } : TONES[tone];
  const Icon = tone === 'done' ? Check : icon === 'coins' ? Coins : icon === 'lock' ? Lock : icon === 'trophy' ? Trophy : null;
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || busy}
      className="flex-row items-center justify-center gap-1 rounded-xl py-2"
      style={{ backgroundColor: colors.bg }}>
      {busy ? <ActivityIndicator size="small" color={colors.text} /> : Icon ? <Icon size={13} color={colors.text} /> : null}
      <Text className="text-xs font-black" style={{ color: colors.text }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
