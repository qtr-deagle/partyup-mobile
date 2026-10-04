import { DEFAULT_FILTERS, FiltersModal, countActiveFilters, type FiltersValue } from '@/components/discover/FiltersModal';
import { CreatePlanModal } from '@/components/discover/CreatePlanModal';
import { SwipeCard } from '@/components/discover/SwipeCard';
import { UserRankTag } from '@/components/guild/UserRankTag';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { riseIn } from '@/components/ui/motion';
import { getMockTripData } from '@/lib/discover-mock';
import { createOrGetDirectThread, removeFriend, respondToFriendRequest, searchProfiles, sendFriendRequest, type SearchProfile } from '@/lib/social';
import { getTheme } from '@/lib/theme';
import { computePlanCompatibility, getPlans, hasCompletePlan, saveMyPlan, type PlanPicks, type TravelPlan } from '@/lib/travelPlans';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowUpDown, Check, ClipboardList, RefreshCw, Search, SlidersHorizontal, Sparkles, UserPlus, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Animated from 'react-native-reanimated';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

type ConnectOutcome = 'sent' | 'friends' | 'alreadySent' | 'alreadyFriends';

const CONNECT_POPUP_TEXT: Record<ConnectOutcome, { title: string; body: (name: string) => string }> = {
  sent: { title: 'Request sent!', body: (name) => `We'll let you know when ${name} accepts.` },
  friends: { title: "You're now friends!", body: (name) => `Say hi to ${name} in Chats.` },
  alreadySent: { title: 'Already requested', body: (name) => `You're still waiting on ${name}.` },
  alreadyFriends: { title: 'Already friends', body: (name) => `You and ${name} are already connected.` },
};

type SortOption = 'compatibility' | 'distance' | 'recentActivity';

const SORT_LABELS: Record<SortOption, string> = {
  compatibility: 'Highest compatibility',
  distance: 'Nearest',
  recentActivity: 'Recent activity',
};

export default function DiscoverScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { profile: myProfile } = useAuth();
  const [mode, setMode] = useState<'swipe' | 'search'>('swipe');

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const cardBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white';
  const textPrimary = isDark ? 'text-white' : 'text-[#1B2340]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const { titleColor } = getTheme(isDark);

  // ----- Search mode (unchanged behavior) -----
  const [query, setQuery] = useState('');
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await searchProfiles(query);
      if (result.error) {
        setErrorMessage(result.error.message);
        setProfiles([]);
      } else {
        setProfiles(result.data);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to search people.');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [query]);
  const { refreshing: searchRefreshing, refreshControl: searchRefreshControl } = usePullToRefresh(runSearch);

  useEffect(() => {
    const timeoutId = setTimeout(() => void runSearch(), 250);
    return () => clearTimeout(timeoutId);
  }, [runSearch]);

  useFocusEffect(
    useCallback(() => {
      void runSearch();
    }, [runSearch])
  );

  async function handleRequest(profileId: string) {
    setRequestingId(profileId);
    setErrorMessage(null);
    const profile = profiles.find((item) => item.id === profileId);
    if (profile?.request_status === 'accepted') {
      Alert.alert('Remove friend?', `Remove ${profile.display_name} from your friends?`, [
        { text: 'Cancel', style: 'cancel', onPress: () => setRequestingId(null) },
        { text: 'Remove', style: 'destructive', onPress: () => void removeFriendAndUpdate(profileId) },
      ]);
      return;
    }
    if (profile?.request_status === 'outgoing_pending' && profile.request_id) {
      const requestId = profile.request_id;
      Alert.alert('Cancel friend request?', `Cancel your request to ${profile.display_name}?`, [
        { text: 'Keep request', style: 'cancel', onPress: () => setRequestingId(null) },
        { text: 'Cancel request', style: 'destructive', onPress: () => void cancelRequestAndUpdate(profileId, requestId) },
      ]);
      return;
    }
    const { data, error } = profile?.request_status === 'incoming_pending' && profile.request_id
      ? await respondToFriendRequest(profile.request_id, 'accepted')
      : await sendFriendRequest(profileId);
    setRequestingId(null);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (profile?.request_status === 'incoming_pending') {
      const threadResult = await createOrGetDirectThread(profileId);
      if (threadResult.error) {
        setErrorMessage(threadResult.error.message);
        return;
      }
    }
    setProfiles((current) => current.map((item) => item.id === profileId ? { ...item, request_status: profile?.request_status === 'incoming_pending' ? 'accepted' : 'outgoing_pending', request_id: data?.id ?? item.request_id } : item));
  }

  async function cancelRequestAndUpdate(profileId: string, requestId: string) {
    setErrorMessage(null);
    const { error } = await respondToFriendRequest(requestId, 'cancelled');
    setRequestingId(null);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setProfiles((current) => current.map((item) => item.id === profileId ? { ...item, request_status: null, request_id: null } : item));
  }

  async function removeFriendAndUpdate(profileId: string) {
    setErrorMessage(null);
    const { error } = await removeFriend(profileId);
    setRequestingId(null);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setProfiles((current) => current.map((item) => item.id === profileId ? { ...item, request_status: null, request_id: null } : item));
  }

  // ----- Swipe mode -----
  const [swipeProfiles, setSwipeProfiles] = useState<SearchProfile[]>([]);
  const [swipeLoading, setSwipeLoading] = useState(false);
  const [swipeError, setSwipeError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filters, setFilters] = useState<FiltersValue>(DEFAULT_FILTERS);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('compatibility');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [plans, setPlans] = useState<Map<string, TravelPlan>>(new Map());
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const myId = myProfile?.id ?? null;
  const myPlan = myId ? plans.get(myId) ?? null : null;
  const myPlanComplete = hasCompletePlan(myPlan);

  async function handleSavePlan(picks: PlanPicks) {
    if (!myId) return;
    setPlanSaving(true);
    setPlanError(null);
    const { error } = await saveMyPlan(myId, picks);
    setPlanSaving(false);
    if (error) {
      setPlanError(error.message);
      return;
    }
    setPlans((current) => {
      const next = new Map(current);
      const existing = current.get(myId);
      next.set(myId, { user_id: myId, gender: existing?.gender ?? null, preferred_gender: existing?.preferred_gender ?? [], ...picks, description: picks.description?.trim() || null });
      return next;
    });
    setPlanModalVisible(false);
  }

  function openPlanModal() {
    setPlanError(null);
    setPlanModalVisible(true);
  }

  const loadSwipeProfiles = useCallback(async () => {
    setSwipeLoading(true);
    setSwipeError(null);
    try {
      const result = await searchProfiles('');
      if (result.error) {
        setSwipeError(result.error.message);
        setSwipeProfiles([]);
      } else {
        setSwipeProfiles(result.data);
        const ids = result.data.map((profile) => profile.id);
        const planResult = await getPlans(myId ? [...ids, myId] : ids);
        if (planResult.error) setSwipeError(planResult.error.message);
        setPlans(planResult.data);
      }
    } catch (error) {
      setSwipeError(error instanceof Error ? error.message : 'Unable to load travelers.');
      setSwipeProfiles([]);
    } finally {
      setSwipeLoading(false);
    }
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      if (mode === 'swipe') void loadSwipeProfiles();
    }, [mode, loadSwipeProfiles])
  );

  const scoredDeck = useMemo(() => {
    return swipeProfiles.map((profile) => {
      const trip = getMockTripData(profile);
      const plan = plans.get(profile.id) ?? null;
      const score = myPlanComplete && hasCompletePlan(plan) ? computePlanCompatibility(myPlan, plan) : null;
      return { profile, trip, plan, score };
    });
  }, [swipeProfiles, plans, myPlan, myPlanComplete]);

  const deck = useMemo(() => {
    const filtered = scoredDeck.filter(({ profile, trip, score }) => {
      if (filters.locations.length > 0 && !filters.locations.some((city) => city === profile.city)) return false;
      if (filters.dateStart && trip.dates.start < filters.dateStart) return false;
      if (filters.dateEnd && trip.dates.start > filters.dateEnd) return false;
      if (filters.budget && trip.budgetTier !== filters.budget) return false;
      if (filters.purposes.length > 0 && !filters.purposes.includes(trip.purpose)) return false;
      if ((score?.overall ?? 0) < filters.minCompatibility) return false;
      if (filters.hasVehicleOnly && !profile.has_vehicle) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortOption === 'distance') return a.trip.distanceKm - b.trip.distanceKm;
      if (sortOption === 'recentActivity') return new Date(b.profile.updated_at ?? 0).getTime() - new Date(a.profile.updated_at ?? 0).getTime();
      // Travelers without a plan (no score) go last.
      return (b.score?.overall ?? -1) - (a.score?.overall ?? -1);
    });
  }, [scoredDeck, filters, sortOption]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [filters, sortOption, swipeProfiles.length, myPlan]);

  const currentEntry = deck[currentIndex];

  async function connectWithProfile(profile: SearchProfile) {
    setSwipeError(null);
    let error: { message: string } | null = null;
    if (profile.request_status === 'incoming_pending' && profile.request_id) {
      const result = await respondToFriendRequest(profile.request_id, 'accepted');
      error = result.error;
      if (!error) {
        const threadResult = await createOrGetDirectThread(profile.id);
        error = threadResult.error;
      }
    } else if (!profile.request_status) {
      const result = await sendFriendRequest(profile.id);
      error = result.error;
    }
    if (error) {
      setSwipeError(error.message);
    } else {
      setConnectPopup({
        profile,
        kind: profile.request_status === 'incoming_pending' ? 'friends'
          : profile.request_status === 'accepted' ? 'alreadyFriends'
          : profile.request_status === 'outgoing_pending' ? 'alreadySent'
          : 'sent',
      });
      if (profile.request_status !== 'accepted' && profile.request_status !== 'outgoing_pending') {
        setSwipeProfiles((current) => current.map((item) => item.id === profile.id ? { ...item, request_status: item.request_status === 'incoming_pending' ? 'accepted' : 'outgoing_pending' } : item));
      }
    }
    setCurrentIndex((index) => index + 1);
  }

  // Confirmation after a right swipe / Connect; hides itself after a moment.
  const [connectPopup, setConnectPopup] = useState<{ profile: SearchProfile; kind: ConnectOutcome } | null>(null);
  useEffect(() => {
    if (!connectPopup) return;
    const timeoutId = setTimeout(() => setConnectPopup(null), 2600);
    return () => clearTimeout(timeoutId);
  }, [connectPopup]);

  function passProfile() {
    setCurrentIndex((index) => index + 1);
  }

  const segmentTrack = isDark ? 'bg-white/5' : 'bg-[#E9EDF5]';
  // Keep shadow-* classes present in every state: NativeWind remounts a
  // component whose styles start using CSS variables (shadows do) after the
  // first render, and remounting animated components mid-session breaks taps.
  const segmentActive = isDark ? 'bg-[#22324B] shadow-sm shadow-transparent' : 'bg-white shadow-sm shadow-black/10';
  const segmentInactive = 'shadow-sm shadow-transparent';
  const chip = isDark ? 'bg-white/5 shadow-sm shadow-transparent' : 'bg-white shadow-sm shadow-black/5';
  const iconMuted = isDark ? '#94A3B8' : '#6C7A95';
  const iconStrong = isDark ? '#E2E8F0' : '#182847';
  const activeFilterCount = countActiveFilters(filters);

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <View className="z-10 flex-row items-center gap-2 px-4 pb-3 pt-3">
        <Text className={`flex-1 text-[24px] font-black tracking-tight ${titleColor}`}>Discover</Text>

        <View className={`flex-row rounded-full p-0.5 ${segmentTrack}`}>
          {(['swipe', 'search'] as const).map((option) => {
            const active = mode === option;
            const Icon = option === 'swipe' ? Sparkles : Search;
            return (
              <TouchableOpacity key={option} onPress={() => setMode(option)} accessibilityLabel={option === 'swipe' ? 'For you' : 'Search'} className={`h-8 w-9 items-center justify-center rounded-full ${active ? segmentActive : segmentInactive}`}>
                <Icon size={16} color={active ? (isDark ? '#FFFFFF' : '#284BD6') : iconMuted} />
              </TouchableOpacity>
            );
          })}
        </View>

        {mode === 'swipe' ? (
          <>
            <View className="relative">
              <TouchableOpacity onPress={() => setSortMenuVisible((visible) => !visible)} accessibilityLabel={`Sort: ${SORT_LABELS[sortOption]}`} className={`h-9 w-9 items-center justify-center rounded-full ${chip}`}>
                <ArrowUpDown size={16} color={iconStrong} />
              </TouchableOpacity>
              {sortMenuVisible ? (
                <View className={`absolute right-0 top-11 w-56 rounded-2xl border p-1.5 shadow-lg ${cardBackground}`}>
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                    <TouchableOpacity key={option} onPress={() => { setSortOption(option); setSortMenuVisible(false); }} className="flex-row items-center justify-between rounded-xl px-3 py-2.5">
                      <Text className={`text-sm ${sortOption === option ? 'font-bold text-[#284BD6]' : textPrimary}`}>{SORT_LABELS[option]}</Text>
                      {sortOption === option ? <Check size={15} color="#284BD6" /> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setFiltersVisible(true)} accessibilityLabel={activeFilterCount > 0 ? `Filters, ${activeFilterCount} on` : 'Filters'} className={`h-9 w-9 items-center justify-center rounded-full ${chip}`}>
              <SlidersHorizontal size={16} color={iconStrong} />
              {activeFilterCount > 0 ? (
                <View className="absolute -right-1 -top-1 h-4 min-w-4 items-center justify-center rounded-full bg-[#284BD6] px-1"><Text className="text-[10px] font-bold text-white">{activeFilterCount}</Text></View>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity onPress={openPlanModal} accessibilityLabel={myPlanComplete ? 'Edit your plan' : 'Create your plan'} className={`h-9 w-9 items-center justify-center rounded-full ${chip}`}>
              <ClipboardList size={16} color={iconStrong} />
              {!myPlanComplete ? <View className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#284BD6]" /> : null}
            </TouchableOpacity>
          </>
        ) : null}

        <TouchableOpacity onPress={() => router.push('/profile')} accessibilityLabel="Open your profile" className="h-9 w-9 items-center justify-center rounded-full bg-[#B7C4EC]">
          {myProfile?.avatar_url ? (
            <Image source={{ uri: myProfile.avatar_url }} className="h-9 w-9 rounded-full" />
          ) : (
            <Text className="text-sm font-bold text-[#24314A]">{(myProfile?.display_name ?? '?').charAt(0).toUpperCase()}</Text>
          )}
        </TouchableOpacity>
      </View>

      {sortMenuVisible ? <Pressable className="absolute inset-0" onPress={() => setSortMenuVisible(false)} /> : null}

      {mode === 'swipe' ? (
        <View className="flex-1 px-4 pb-3">
          {swipeError ? <Text className="mb-3 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{swipeError}</Text> : null}

          {swipeLoading && !swipeProfiles.length ? (
            <ActivityIndicator key="swipe-loading" className="mt-10" color="#284BD6" />
          ) : currentEntry ? (
            <View key={`card-${currentEntry.profile.id}`} className="flex-1">
              <SwipeCard
                profile={currentEntry.profile}
                distanceKm={currentEntry.trip.distanceKm}
                plan={currentEntry.plan}
                score={currentEntry.score}
                viewerHasPlan={myPlanComplete}
                canGoBack={currentIndex > 0}
                isDark={isDark}
                onConnect={(profile) => void connectWithProfile(profile)}
                onPass={passProfile}
                onPrevious={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                onCreatePlan={openPlanModal}
              />
            </View>
          ) : (
            <View key="swipe-empty" className="flex-1 items-center justify-center px-8">
              <View className={`h-20 w-20 items-center justify-center rounded-full ${isDark ? 'bg-[#284BD6]/25' : 'bg-[#284BD6]/10'}`}>
                <Sparkles size={34} color="#284BD6" />
              </View>
              <Text className={`mt-5 text-center text-xl font-black ${textPrimary}`}>You&apos;re all caught up</Text>
              <Text className={`mt-1.5 text-center text-[15px] leading-[22px] ${textSecondary}`}>Check back later or adjust your filters to see more travelers.</Text>
              <View className="mt-6 flex-row gap-3">
                <TouchableOpacity onPress={() => void loadSwipeProfiles()} className={`flex-row items-center gap-2 rounded-full px-5 py-3 ${chip}`}>
                  <RefreshCw size={16} color={iconStrong} />
                  <Text className={`font-bold ${textPrimary}`}>Refresh</Text>
                </TouchableOpacity>
                {activeFilterCount > 0 ? (
                  <TouchableOpacity onPress={() => setFilters(DEFAULT_FILTERS)} className="rounded-full bg-[#284BD6] px-5 py-3">
                    <Text className="font-bold text-white">Reset filters</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="pb-28" keyboardShouldPersistTaps="handled" refreshControl={searchRefreshControl}>
          <View className="px-5 pb-4">
            <Pressable onPress={() => searchInputRef.current?.focus()} className={`flex-row items-center gap-3 rounded-2xl px-4 py-3.5 ${chip}`}>
              <Search size={19} color={iconMuted} />
              <TextInput ref={searchInputRef} value={query} onChangeText={setQuery} editable autoCapitalize="none" autoCorrect={false} returnKeyType="search" placeholder="Search by name or interest" placeholderTextColor="#8A96AD" className={`flex-1 text-[16px] ${textPrimary}`} />
              {query ? (
                <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search" className={`h-6 w-6 items-center justify-center rounded-full ${isDark ? 'bg-white/10' : 'bg-[#E9EDF5]'}`}>
                  <X size={13} color={iconMuted} />
                </TouchableOpacity>
              ) : null}
            </Pressable>
          </View>

          {errorMessage ? <Text className="mx-5 mb-3 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
          {loading && !searchRefreshing ? <ActivityIndicator className="mt-6" color="#284BD6" /> : null}
          {!loading && !profiles.length ? <Text className={`px-5 pt-8 text-center text-base ${textSecondary}`}>{query ? 'No users found.' : 'No other active users yet.'}</Text> : null}

          <View className="gap-2.5 px-5">
            {profiles.map((profile) => {
              const friendly = profile.request_status === 'accepted' || profile.request_status === 'outgoing_pending';
              return (
                <View key={profile.id} className={`flex-row items-center gap-3 rounded-3xl border p-3 ${cardBackground}`}>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/profile/[id]', params: { id: profile.id, displayName: profile.display_name, interests: JSON.stringify(profile.interests), avatarUrl: profile.avatar_url ?? '', requestStatus: profile.request_status ?? '', requestId: profile.request_id ?? '' } })}
                    className="flex-1 flex-row items-center gap-3.5"
                    accessibilityLabel={`View ${profile.display_name}'s profile`}
                  >
                    <View className="h-14 w-14 items-center justify-center rounded-full bg-[#B7C4EC]">{profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} className="h-14 w-14 rounded-full" /> : <Text className="text-xl font-bold text-[#24314A]">{profile.display_name.charAt(0).toUpperCase()}</Text>}<UserRankTag userId={profile.id} isDark={isDark} variant="overlay" size={22} /></View>
                    <View className="flex-1">
                      <Text numberOfLines={1} className={`text-base font-bold ${textPrimary}`}>{profile.display_name}</Text>
                      <Text numberOfLines={1} className={`mt-0.5 text-[13px] ${textSecondary}`}>{profile.interests.length ? profile.interests.join(' · ') : 'No interests selected'}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void handleRequest(profile.id)} disabled={requestingId === profile.id} className={`h-10 min-w-[96px] flex-row items-center justify-center gap-1.5 rounded-full px-3.5 ${friendly ? (isDark ? 'bg-white/10' : 'bg-[#E9EDF5]') : 'bg-[#284BD6]'}`}>
                    {requestingId === profile.id ? <ActivityIndicator size="small" color={friendly ? '#284BD6' : '#FFFFFF'} /> : <>{profile.request_status === 'accepted' || profile.request_status === 'incoming_pending' ? <Check size={15} color={friendly ? '#284BD6' : '#FFFFFF'} /> : profile.request_status === 'outgoing_pending' ? <X size={15} color="#284BD6" /> : <UserPlus size={15} color="#FFFFFF" />}<Text className={`text-[13px] font-bold ${friendly ? (isDark ? 'text-white' : 'text-[#284BD6]') : 'text-white'}`}>{profile.request_status === 'accepted' ? 'Friends' : profile.request_status === 'outgoing_pending' ? 'Cancel' : profile.request_status === 'incoming_pending' ? 'Confirm' : 'Add'}</Text></>}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {connectPopup ? (
        <Pressable key="connect-popup" onPress={() => setConnectPopup(null)} className="absolute inset-0 items-center justify-center bg-black/40 px-10">
          <Animated.View key={`connect-popup-${connectPopup.profile.id}`} entering={riseIn(0, 300)} className={`w-full items-center rounded-[28px] px-6 pb-6 pt-7 ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}>
            <View className="h-20 w-20 items-center justify-center rounded-full bg-[#B7C4EC]">
              {connectPopup.profile.avatar_url ? (
                <Image source={{ uri: connectPopup.profile.avatar_url }} className="h-20 w-20 rounded-full" />
              ) : (
                <Text className="text-2xl font-black text-[#24314A]">{connectPopup.profile.display_name.charAt(0).toUpperCase()}</Text>
              )}
              <View className="absolute -bottom-1 -right-1 h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#22C55E]">
                <Check size={16} color="#FFFFFF" strokeWidth={3} />
              </View>
            </View>
            <Text className={`mt-4 text-center text-xl font-black ${textPrimary}`}>{CONNECT_POPUP_TEXT[connectPopup.kind].title}</Text>
            <Text className={`mt-1 text-center text-[15px] leading-[22px] ${textSecondary}`}>{CONNECT_POPUP_TEXT[connectPopup.kind].body(connectPopup.profile.display_name)}</Text>
            <TouchableOpacity onPress={() => setConnectPopup(null)} className="mt-5 w-full items-center rounded-full bg-[#284BD6] py-3">
              <Text className="font-bold text-white">Keep swiping</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      ) : null}

      <FiltersModal visible={filtersVisible} value={filters} isDark={isDark} onApply={(next) => { setFilters(next); setFiltersVisible(false); }} onClose={() => setFiltersVisible(false)} />
      <CreatePlanModal visible={planModalVisible} value={myPlan} isDark={isDark} saving={planSaving} errorMessage={planError} onSave={(picks) => void handleSavePlan(picks)} onClose={() => setPlanModalVisible(false)} />
    </View>
  );
}
