import { DEFAULT_FILTERS, FiltersModal, countActiveFilters, type FiltersValue } from '@/components/discover/FiltersModal';
import { MyTripModal } from '@/components/discover/MyTripModal';
import { SwipeCard } from '@/components/discover/SwipeCard';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { computeCompatibility, EMPTY_MY_TRIP, loadMyTrip, saveMyTrip, type MyTrip } from '@/lib/compatibility';
import { getMockTripData } from '@/lib/discover-mock';
import { createOrGetDirectThread, removeFriend, respondToFriendRequest, searchProfiles, sendFriendRequest, type SearchProfile } from '@/lib/social';
import { getTheme, typography } from '@/lib/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronDown, ChevronLeft, ChevronRight, Check, MapPin, Search, SlidersHorizontal, Sparkles, UserPlus, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

type SortOption = 'compatibility' | 'distance' | 'dateOverlap' | 'destinationPriority' | 'recentActivity';

const SORT_LABELS: Record<SortOption, string> = {
  compatibility: 'Highest compatibility',
  distance: 'Nearest',
  dateOverlap: 'Date overlap',
  destinationPriority: 'Destination priority',
  recentActivity: 'Recent activity',
};

export default function DiscoverScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { profile: myProfile } = useAuth();
  const [mode, setMode] = useState<'swipe' | 'search'>('swipe');

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const cardBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white';
  const inputBackground = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#D8E0EE] bg-white';
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
  const [myTrip, setMyTrip] = useState<MyTrip>(EMPTY_MY_TRIP);
  const [myTripModalVisible, setMyTripModalVisible] = useState(false);
  const myInterests = useMemo(() => myProfile?.interests ?? [], [myProfile]);

  useEffect(() => {
    void loadMyTrip().then(setMyTrip);
  }, []);

  function handleSaveMyTrip(next: MyTrip) {
    setMyTrip(next);
    setMyTripModalVisible(false);
    void saveMyTrip(next);
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
      }
    } catch (error) {
      setSwipeError(error instanceof Error ? error.message : 'Unable to load travelers.');
      setSwipeProfiles([]);
    } finally {
      setSwipeLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (mode === 'swipe') void loadSwipeProfiles();
    }, [mode, loadSwipeProfiles])
  );

  const scoredDeck = useMemo(() => {
    return swipeProfiles.map((profile) => {
      const trip = getMockTripData(profile);
      const score = computeCompatibility(profile, myInterests, myTrip, trip);
      return { profile, trip, score };
    });
  }, [swipeProfiles, myInterests, myTrip]);

  const deck = useMemo(() => {
    const filtered = scoredDeck.filter(({ profile, trip, score }) => {
      if (filters.location.trim()) {
        const needle = filters.location.trim().toLowerCase();
        const haystack = `${profile.city ?? ''} ${profile.country ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (filters.dateStart && trip.dates.start < filters.dateStart) return false;
      if (filters.dateEnd && trip.dates.start > filters.dateEnd) return false;
      if (filters.budget && trip.budgetTier !== filters.budget) return false;
      if (filters.purpose && trip.purpose !== filters.purpose) return false;
      if (score.overall < filters.minCompatibility) return false;
      if (filters.carpoolOnly && !trip.carpoolAvailable) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortOption === 'distance') return a.trip.distanceKm - b.trip.distanceKm;
      if (sortOption === 'dateOverlap') return b.score.dateAlignment - a.score.dateAlignment;
      if (sortOption === 'recentActivity') return new Date(b.profile.updated_at ?? 0).getTime() - new Date(a.profile.updated_at ?? 0).getTime();
      if (sortOption === 'destinationPriority') {
        const destination = myTrip.destination.trim().toLowerCase();
        const aMatches = destination !== '' && a.trip.route.destination.toLowerCase() === destination;
        const bMatches = destination !== '' && b.trip.route.destination.toLowerCase() === destination;
        if (aMatches !== bMatches) return aMatches ? -1 : 1;
        return b.score.overall - a.score.overall;
      }
      return b.score.overall - a.score.overall;
    });
  }, [scoredDeck, filters, sortOption, myTrip.destination]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [filters, sortOption, swipeProfiles.length, myTrip]);

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
    } else if (profile.request_status !== 'accepted' && profile.request_status !== 'outgoing_pending') {
      setSwipeProfiles((current) => current.map((item) => item.id === profile.id ? { ...item, request_status: item.request_status === 'incoming_pending' ? 'accepted' : 'outgoing_pending' } : item));
    }
    setCurrentIndex((index) => index + 1);
  }

  function passProfile() {
    setCurrentIndex((index) => index + 1);
  }

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <View className="px-4 pb-3 pt-5">
        <View className="flex-row items-center justify-between">
          <Text className={`${typography.pageTitle} ${titleColor}`}>Discover</Text>
        </View>
        <View className={`mt-4 flex-row rounded-full border p-1 ${inputBackground}`}>
          <TouchableOpacity onPress={() => setMode('swipe')} className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-full py-2 ${mode === 'swipe' ? 'bg-[#284BD6]' : ''}`}>
            <Sparkles size={15} color={mode === 'swipe' ? '#FFFFFF' : '#7A859D'} />
            <Text className={`text-sm font-bold ${mode === 'swipe' ? 'text-white' : textSecondary}`}>Swipe</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode('search')} className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-full py-2 ${mode === 'search' ? 'bg-[#284BD6]' : ''}`}>
            <Search size={15} color={mode === 'search' ? '#FFFFFF' : '#7A859D'} />
            <Text className={`text-sm font-bold ${mode === 'search' ? 'text-white' : textSecondary}`}>Search</Text>
          </TouchableOpacity>
        </View>
      </View>

      {mode === 'swipe' ? (
        <View className="flex-1">
          <View className="z-10 flex-row items-center justify-between px-4 pb-3">
            <View className="relative">
              <TouchableOpacity onPress={() => setSortMenuVisible((visible) => !visible)} className={`flex-row items-center gap-1.5 rounded-full border px-3 py-2 ${cardBackground}`}>
                <Text className={`text-sm font-semibold ${textPrimary}`}>{SORT_LABELS[sortOption]}</Text>
                <ChevronDown size={15} color={isDark ? '#94A3B8' : '#6C7A95'} />
              </TouchableOpacity>
              {sortMenuVisible ? (
                <View className={`absolute left-0 top-11 w-56 rounded-2xl border p-1.5 shadow-lg ${cardBackground}`}>
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                    <TouchableOpacity key={option} onPress={() => { setSortOption(option); setSortMenuVisible(false); }} className="flex-row items-center justify-between rounded-xl px-3 py-2.5">
                      <Text className={`text-sm ${sortOption === option ? 'font-bold text-[#284BD6]' : textPrimary}`}>{SORT_LABELS[option]}</Text>
                      {sortOption === option ? <Check size={15} color="#284BD6" /> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setFiltersVisible(true)} className={`flex-row items-center gap-1.5 rounded-full border px-3 py-2 ${cardBackground}`}>
              <SlidersHorizontal size={15} color={isDark ? '#94A3B8' : '#6C7A95'} />
              <Text className={`text-sm font-semibold ${textPrimary}`}>Filter</Text>
              {countActiveFilters(filters) > 0 ? (
                <View className="h-4 w-4 items-center justify-center rounded-full bg-[#284BD6]"><Text className="text-[10px] font-bold text-white">{countActiveFilters(filters)}</Text></View>
              ) : null}
            </TouchableOpacity>
          </View>

          {sortMenuVisible ? <Pressable className="absolute inset-0" onPress={() => setSortMenuVisible(false)} /> : null}

          <TouchableOpacity onPress={() => setMyTripModalVisible(true)} className={`mx-4 mb-3 flex-row items-center gap-2 rounded-2xl border px-4 py-2.5 ${cardBackground}`}>
            <MapPin size={15} color="#284BD6" />
            <Text className={`flex-1 text-sm ${textSecondary}`}>
              {myTrip.destination.trim() ? <Text className={`font-bold ${textPrimary}`}>{myTrip.origin.trim() || 'Anywhere'} → {myTrip.destination}</Text> : 'Set your trip to sharpen your matches'}
            </Text>
            <Text className="text-xs font-bold text-[#284BD6]">Edit</Text>
          </TouchableOpacity>

          {swipeError ? <Text className="mx-4 mb-3 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{swipeError}</Text> : null}

          <View className="flex-1">
            {swipeLoading ? (
              <ActivityIndicator className="mt-10" color="#284BD6" />
            ) : currentEntry ? (
              <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6" showsVerticalScrollIndicator={false}>
                <SwipeCard profile={currentEntry.profile} trip={currentEntry.trip} score={currentEntry.score} isDark={isDark} onConnect={(profile) => void connectWithProfile(profile)} onPass={passProfile} />

                <View className="mt-4 flex-row items-center justify-center gap-6">
                  <TouchableOpacity onPress={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0} className={`h-11 w-11 items-center justify-center rounded-full border ${cardBackground} ${currentIndex === 0 ? 'opacity-40' : ''}`}>
                    <ChevronLeft size={20} color={isDark ? '#E2E8F0' : '#182847'} />
                  </TouchableOpacity>
                  <View className="flex-row items-center gap-1.5">
                    {deck.slice(0, 8).map((entry, index) => (
                      <View key={entry.profile.id} className={`h-2 rounded-full ${index === currentIndex ? 'w-5 bg-[#284BD6]' : 'w-2 bg-[#C6CEDD]'}`} />
                    ))}
                  </View>
                  <TouchableOpacity onPress={passProfile} className={`h-11 w-11 items-center justify-center rounded-full border ${cardBackground}`}>
                    <ChevronRight size={20} color={isDark ? '#E2E8F0' : '#182847'} />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              <View className="flex-1 items-center justify-center px-8">
                <Sparkles size={40} color="#94A3B8" />
                <Text className={`mt-4 text-center text-lg font-bold ${textPrimary}`}>You&apos;re all caught up</Text>
                <Text className={`mt-1 text-center text-base ${textSecondary}`}>Check back later or adjust your filters to see more travelers.</Text>
                {countActiveFilters(filters) > 0 ? (
                  <TouchableOpacity onPress={() => setFilters(DEFAULT_FILTERS)} className="mt-5 rounded-2xl bg-[#284BD6] px-6 py-3">
                    <Text className="font-bold text-white">Reset filters</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="pb-28">
          <View className="px-4 pb-5">
            <Text className={`mt-1 text-base ${textSecondary}`}>Search active PartyUp travelers and connect.</Text>
            <Pressable onPress={() => searchInputRef.current?.focus()} className={`mt-5 flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${inputBackground}`}>
              <Search size={20} color="#7A859D" />
              <TextInput ref={searchInputRef} value={query} onChangeText={setQuery} editable autoCapitalize="none" autoCorrect={false} returnKeyType="search" placeholder="Search by name or interest" placeholderTextColor="#72809B" className={`flex-1 text-[16px] ${textPrimary}`} />
            </Pressable>
          </View>

          {errorMessage ? <Text className="mx-4 mb-3 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
          {loading ? <ActivityIndicator className="mt-6" color="#284BD6" /> : null}
          {!loading && !profiles.length ? <Text className={`px-4 pt-8 text-center text-base ${textSecondary}`}>{query ? 'No users found.' : 'No other active users yet.'}</Text> : null}

          <View className="gap-3 px-4">
            {profiles.map((profile) => (
              <View key={profile.id} className={`rounded-[24px] border p-4 ${cardBackground}`}>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/profile/[id]', params: { id: profile.id, displayName: profile.display_name, interests: JSON.stringify(profile.interests), avatarUrl: profile.avatar_url ?? '', requestStatus: profile.request_status ?? '', requestId: profile.request_id ?? '' } })}
                  className="flex-row items-center gap-3"
                  accessibilityLabel={`View ${profile.display_name}'s profile`}
                >
                  <View className="h-14 w-14 items-center justify-center rounded-full bg-[#B7C4EC]"><Text className="text-xl font-bold text-[#24314A]">{profile.display_name.charAt(0).toUpperCase()}</Text></View>
                  <View className="flex-1"><Text className={`text-xl font-black ${textPrimary}`}>{profile.display_name}</Text><Text className={`mt-1 text-sm ${textSecondary}`}>{profile.interests.length ? profile.interests.join('  •  ') : 'No interests selected'}</Text></View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void handleRequest(profile.id)} disabled={requestingId === profile.id} className={`mt-4 flex-row items-center justify-center gap-2 rounded-2xl py-3 ${profile.request_status === 'accepted' || profile.request_status === 'outgoing_pending' ? 'bg-[#9EAFE9]' : 'bg-[#284BD6]'}`}>
                  {requestingId === profile.id ? <ActivityIndicator color="#FFFFFF" /> : <>{profile.request_status === 'accepted' || profile.request_status === 'incoming_pending' ? <Check size={17} color="#FFFFFF" /> : profile.request_status === 'outgoing_pending' ? <X size={17} color="#FFFFFF" /> : <UserPlus size={17} color="#FFFFFF" />}<Text className="font-bold text-white">{profile.request_status === 'accepted' ? 'Friends' : profile.request_status === 'outgoing_pending' ? 'Cancel request' : profile.request_status === 'incoming_pending' ? 'Confirm' : 'Add Friend'}</Text></>}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <FiltersModal visible={filtersVisible} value={filters} isDark={isDark} onApply={(next) => { setFilters(next); setFiltersVisible(false); }} onClose={() => setFiltersVisible(false)} />
      <MyTripModal visible={myTripModalVisible} value={myTrip} isDark={isDark} onSave={handleSaveMyTrip} onClose={() => setMyTripModalVisible(false)} />
    </View>
  );
}
