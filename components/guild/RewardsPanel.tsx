import { CosmeticsShop } from '@/components/guild/CosmeticsShop';
import { RankMedal } from '@/components/guild/RankMedal';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, SkeletonRow } from '@/components/ui/motion';
import { Card } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listCosmetics, listOwnedCosmetics, type Cosmetic, type OwnedCosmetic } from '@/lib/cosmetics';
import { parseTimestamp } from '@/lib/datetime';
import {
  getMyGuildLevel,
  getPointsSummary,
  guildPerkDiscount,
  MAX_TOTAL_DISCOUNT,
  listMyRedemptions,
  listRewards,
  rankDiscount,
  rankFor,
  rankIndexOf,
  redeemReward,
  rewardPrice,
  totalDiscount,
  type GuildReward,
  type RewardRedemption,
} from '@/lib/guilds';
import { getTheme, typography } from '@/lib/theme';
import { useFocusEffect } from 'expo-router';
import { Coins, Gift, Lock, Percent } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/lib/dialog';
const STATUS_LABEL: Record<RewardRedemption['status'], string> = {
  pending: 'Waiting for an admin',
  fulfilled: 'Fulfilled',
  rejected: 'Declined · refunded',
};

// Coin balance, reward catalog and the user's redemption requests. Used as the
// Guild screen's Rewards tab and as the standalone /rewards screen.
export function RewardsPanel() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { primaryColor, accentColor, warningColor, destructiveColor, primaryText, mutedText, mutedPanel } = getTheme(isDark);

  const [coins, setCoins] = useState(0);
  const [lifetime, setLifetime] = useState(0);
  const [guildLevel, setGuildLevel] = useState(0);
  const [rewards, setRewards] = useState<GuildReward[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cosmetics, setCosmetics] = useState<Cosmetic[]>([]);
  const [ownedCosmetics, setOwnedCosmetics] = useState<OwnedCosmetic[]>([]);
  const userId = profile?.id;

  const load = useCallback(async () => {
    setErrorMessage(null);
    const [summaryResult, rewardsResult, redemptionsResult, levelResult, cosmeticsResult, ownedResult] = await Promise.all([
      getPointsSummary(),
      listRewards(),
      listMyRedemptions(),
      getMyGuildLevel(),
      listCosmetics(),
      userId ? listOwnedCosmetics(userId) : Promise.resolve({ data: [] as OwnedCosmetic[], error: null }),
    ]);
    const firstError = summaryResult.error ?? rewardsResult.error ?? redemptionsResult.error ?? levelResult.error ?? cosmeticsResult.error ?? ownedResult.error;
    if (firstError) setErrorMessage(firstError.message);
    setCoins(summaryResult.data?.coins ?? 0);
    setLifetime(summaryResult.data?.lifetime_points ?? 0);
    setGuildLevel(levelResult.data);
    setRewards(rewardsResult.data);
    setRedemptions(redemptionsResult.data);
    setCosmetics(cosmeticsResult.data);
    setOwnedCosmetics(ownedResult.data);
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function confirmRedeem(reward: GuildReward) {
    showAlert(`Redeem ${reward.title}?`, `This spends ${rewardPrice(reward.cost, lifetime, guildLevel)} coins. An admin will fulfill it, and you'll be refunded if it's declined.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Redeem',
        onPress: async () => {
          setBusyId(reward.id);
          const { error } = await redeemReward(reward.id);
          setBusyId(null);
          if (error) {
            showAlert('Could not redeem', error.message);
            return;
          }
          showAlert('Request sent', "We'll notify you when an admin fulfills it.");
          await load();
        },
      },
    ]);
  }

  // Hide rewards meant for the other role so the catalog only shows what you can claim.
  const available = rewards.filter((reward) => reward.audience === 'everyone' || reward.audience === profile?.role);
  const { rank: myRank, index: myRankIndex } = rankFor(lifetime);
  const discount = rankDiscount(lifetime);
  const guildDiscount = guildPerkDiscount(guildLevel);

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pt-5"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={primaryColor} />}>
      {errorMessage ? (
        <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
          <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
        </View>
      ) : null}

      <Card>
        <View className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: warningColor }}>
            <Coins size={24} color="#FFFFFF" />
          </View>
          <View className="flex-1">
            <Text className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>Your balance</Text>
            <Text className={`${typography.valueLarge} ${primaryText}`}>{loading ? '—' : `${coins} coins`}</Text>
          </View>
        </View>
        {discount > 0 ? (
          <View className={`mt-3 flex-row items-center gap-2 rounded-xl px-3 py-2 ${mutedPanel}`}>
            <Percent size={14} color={myRank.color} />
            <Text className={`flex-1 text-xs font-bold ${primaryText}`}>
              {myRank.name} perk: {discount}% off every reward
            </Text>
          </View>
        ) : null}
        {guildDiscount > 0 ? (
          <View className={`mt-2 flex-row items-center gap-2 rounded-xl px-3 py-2 ${mutedPanel}`}>
            <Percent size={14} color="#179B67" />
            <Text className={`flex-1 text-xs font-bold ${primaryText}`}>
              Guild Level {guildLevel} perk: {guildDiscount}% off every reward
            </Text>
          </View>
        ) : null}
        {discount > 0 && guildDiscount > 0 && totalDiscount(lifetime, guildLevel) === MAX_TOTAL_DISCOUNT ? (
          <Text className={`mt-1.5 text-[11px] ${mutedText}`}>Max discount reached ({MAX_TOTAL_DISCOUNT}% total)</Text>
        ) : null}
      </Card>

      {!loading && cosmetics.length > 0 ? (
        <CosmeticsShop
          key="cosmetics"
          isDark={isDark}
          index={1}
          catalog={cosmetics}
          owned={ownedCosmetics}
          coins={coins}
          lifetime={lifetime}
          guildLevel={guildLevel}
          onChanged={load}
        />
      ) : null}

      {loading ? (
        <Card key="loading">
          {[0, 1, 2].map((index) => (
            <SkeletonRow key={index} />
          ))}
        </Card>
      ) : available.length === 0 ? (
        <EmptyState key="empty" icon={<Gift size={34} color="#2A55D4" />} title="No rewards yet" message="Admins are stocking the catalog. Keep earning in the meantime." />
      ) : (
        <View key="catalog" className="gap-3">
          {available.map((reward, index) => {
            const outOfStock = reward.stock !== null && reward.stock <= 0;
            const price = rewardPrice(reward.cost, lifetime, guildLevel);
            const rankLocked = reward.min_rank !== null && myRankIndex < rankIndexOf(reward.min_rank);
            const affordable = coins >= price;
            const disabled = outOfStock || rankLocked || !affordable || busyId === reward.id;
            return (
              <Card key={reward.id} index={index}>
                <View className="flex-row items-start gap-3">
                  {reward.min_rank ? (
                    <View key="rank" className="h-11 w-11 items-center justify-center">
                      <RankMedal rank={reward.min_rank} size={34} locked={rankLocked} />
                    </View>
                  ) : (
                    <View key="gift" className={`h-11 w-11 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
                      <Gift size={20} color={primaryColor} />
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className={`text-base font-bold ${primaryText}`}>{reward.title}</Text>
                    {reward.description ? <Text className={`mt-0.5 text-sm ${mutedText}`}>{reward.description}</Text> : null}
                    <Text className={`mt-1 text-xs ${mutedText}`}>
                      {reward.min_rank ? `${reward.min_rank}+ rank · ` : ''}
                      {reward.audience === 'guild_leader' ? 'Guild Leaders only · ' : reward.audience === 'traveler' ? 'Travelers only · ' : ''}
                      {reward.stock === null ? 'Unlimited' : `${reward.stock} left`}
                    </Text>
                  </View>
                </View>
                <AnimatedPressable
                  onPress={() => confirmRedeem(reward)}
                  disabled={disabled}
                  className={`mt-3 flex-row items-center justify-center gap-2 rounded-2xl py-3 ${disabled ? (isDark ? 'bg-[#22324B]' : 'bg-[#E2E8F0]') : 'bg-[#284BD6]'}`}>
                  {busyId === reward.id ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : rankLocked ? (
                    <Lock size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                  ) : (
                    <Coins size={16} color={disabled ? (isDark ? '#94A3B8' : '#64748B') : '#FFFFFF'} />
                  )}
                  <Text className={`font-bold ${disabled ? mutedText : 'text-white'}`}>
                    {outOfStock
                      ? 'Out of stock'
                      : rankLocked
                        ? `Unlocks at ${reward.min_rank}`
                        : affordable
                          ? `Redeem · ${price}`
                          : `Need ${price - coins} more`}
                  </Text>
                  {price < reward.cost && !rankLocked && !outOfStock ? (
                    <Text className={`text-xs line-through ${disabled ? mutedText : 'text-white/70'}`}>{reward.cost}</Text>
                  ) : null}
                </AnimatedPressable>
              </Card>
            );
          })}
        </View>
      )}

      {redemptions.length > 0 ? (
        <Card key="history">
          <Text className={`${typography.sectionTitle} ${primaryText}`}>My Requests</Text>
          <View className="mt-3 gap-2">
            {redemptions.map((item) => (
              <View key={item.id} className={`rounded-2xl p-3 ${mutedPanel}`}>
                <View className="flex-row items-center justify-between gap-3">
                  <Text className={`flex-1 text-sm font-bold ${primaryText}`}>{item.reward?.title ?? 'Reward'}</Text>
                  <Text className="text-xs font-bold" style={{ color: item.status === 'fulfilled' ? accentColor : item.status === 'rejected' ? destructiveColor : warningColor }}>
                    {STATUS_LABEL[item.status]}
                  </Text>
                </View>
                <Text className={`mt-0.5 text-xs ${mutedText}`}>
                  {item.cost} coins · {parseTimestamp(item.created_at).toLocaleDateString()}
                </Text>
                {item.admin_notes ? <Text className={`mt-1 text-xs ${mutedText}`}>Note: {item.admin_notes}</Text> : null}
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}
