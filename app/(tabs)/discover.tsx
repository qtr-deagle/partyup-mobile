import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Filter, MapPin, Search, Shield, SlidersHorizontal, Star, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

const travelers = [
  {
    id: 1,
    name: 'Emma',
    age: 23,
    destination: 'Batangas getaway',
    route: 'Makati → Batangas',
    dates: 'Mar 18, 2026 - Mar 19, 2026',
    distance: '3.2 km away',
    rating: 4.9,
    verified: true,
    compatibility: 92,
    matchLabel: 'Overall Match',
    interests: ['Vacation', 'Luxury', 'Instagram Hunter'],
    tags: ['Beach', 'Shopping', 'Resorts', 'Brunch'],
    reason: 70,
  },
  {
    id: 2,
    name: 'Alex',
    age: 28,
    destination: 'BGC weekend',
    route: 'Ortigas → BGC',
    dates: 'Mar 20, 2026 - Mar 21, 2026',
    distance: '1.8 km away',
    rating: 4.8,
    verified: true,
    compatibility: 87,
    matchLabel: 'Overall Match',
    interests: ['Business', 'Coffee Stops'],
    tags: ['Nightlife', 'Food', 'Meetups'],
    reason: 60,
  },
];

type FilterKey = 'All' | 'Today' | 'This Week' | 'Verified';
type BudgetKey = 'Budget' | 'Mid-range' | 'Luxury';
type PurposeKey = 'Vacation' | 'Business' | 'Backpacking' | 'Study';

const purposeOptions: PurposeKey[] = ['Vacation', 'Business', 'Backpacking', 'Study'];

export default function DiscoverScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeBudget, setActiveBudget] = useState<BudgetKey>('Mid-range');
  const [activePurpose, setActivePurpose] = useState<PurposeKey[]>(['Vacation']);
  const [compatibility, setCompatibility] = useState(60);

  const filteredTravelers = useMemo(() => {
    return travelers.filter((traveler) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !query || traveler.name.toLowerCase().includes(query) || traveler.destination.toLowerCase().includes(query) || traveler.route.toLowerCase().includes(query);
      const matchesFilter = activeFilter === 'All' || (activeFilter === 'Verified' ? traveler.verified : true);

      return matchesQuery && matchesFilter;
    });
  }, [activeFilter, searchQuery]);

  const featuredTraveler = filteredTravelers[0] ?? travelers[0];

  return (
    <>
      <ScrollView className="flex-1 bg-[#F6F8FC]" contentContainerClassName="pb-28">
        <View className="absolute -top-24 -right-20 h-56 w-56 rounded-full bg-[#DCE6FF] opacity-70" />
        <View className="absolute top-48 -left-24 h-52 w-52 rounded-full bg-[#DDEFE8] opacity-70" />

        <View className="px-4 pt-4 pb-5 border-b border-black/5 bg-white/80">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[32px] leading-10 font-black text-[#182A4D]">Discover</Text>
              <Text className="mt-1 text-base text-[#6C7A95]">Find nearby travel buddies</Text>
            </View>
            <View className="h-11 w-11 items-center justify-center rounded-full bg-[#EEF3FF]">
              <Search size={18} color="#284BD6" />
            </View>
          </View>

          <View className="mt-4 flex-row items-center gap-2">
            <TouchableOpacity className="flex-1 flex-row items-center justify-between rounded-2xl border border-[#D8E0EE] bg-white px-3 py-3">
              <Text className="text-sm font-semibold text-[#24314A]">Highest compatibility</Text>
              <ChevronDown size={16} color="#6C7A95" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setFilterOpen(true)} className="flex-row items-center gap-2 rounded-2xl border border-[#D8E0EE] bg-white px-3 py-3">
              <Filter size={16} color="#24314A" />
              <Text className="text-sm font-semibold text-[#24314A]">Filter</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="px-4 pt-4 flex flex-col gap-4">
          <View className="rounded-[24px] border border-[#E4EAF2] bg-white p-4 shadow-sm shadow-black/5">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <View className="flex-row items-center gap-2">
                  <Text className="text-2xl font-black text-[#1B2340]">{featuredTraveler.name}, {featuredTraveler.age}</Text>
                  <Shield size={16} color="#18A06A" />
                </View>
                <Text className="mt-2 text-base text-[#6D7A96]">Beach lover planning a quick Batangas getaway.</Text>
                <View className="mt-3 flex-row items-center gap-2">
                  <MapPin size={14} color="#284BD6" />
                  <Text className="text-sm font-medium text-[#284BD6]">{featuredTraveler.distance}</Text>
                </View>
              </View>
              <View className="rounded-full bg-[#EEF2FF] px-3 py-1">
                <View className="flex-row items-center gap-1">
                  <Star size={12} color="#6B77F5" fill="#6B77F5" />
                  <Text className="text-xs font-bold text-[#6B77F5]">4.9</Text>
                </View>
              </View>
            </View>

            <View className="mt-4 border-t border-[#EDF0F5] pt-4">
              <Text className="text-sm text-[#5E6A82]">Route: <Text className="font-semibold text-[#24314A]">{featuredTraveler.route}</Text></Text>
              <Text className="mt-2 text-sm text-[#5E6A82]">Dates: <Text className="font-semibold text-[#24314A]">{featuredTraveler.dates}</Text></Text>

              <View className="mt-3 flex-row flex-wrap gap-2">
                {featuredTraveler.interests.map((interest) => (
                  <View key={interest} className="rounded-full border border-[#D8E0EE] bg-white px-3 py-1.5">
                    <Text className="text-xs font-semibold text-[#24314A]">{interest}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="mt-4 border-t border-[#EDF0F5] pt-4">
              <Text className="text-xs font-bold uppercase tracking-[0.12em] text-[#8794A9]">Interests</Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {featuredTraveler.tags.map((tag) => (
                  <View key={tag} className="rounded-full bg-[#F2F4F7] px-3 py-1.5">
                    <Text className="text-xs font-semibold text-[#7E8798]">{tag}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="mt-4 border-t border-[#EDF0F5] pt-4">
              <Text className="text-xs font-bold uppercase tracking-[0.12em] text-[#8794A9]">Why we matched</Text>
              <View className="mt-3 gap-3">
                <View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm text-[#24314A]">Interests</Text>
                    <Text className="text-sm font-semibold text-[#24314A]">{featuredTraveler.reason}%</Text>
                  </View>
                  <View className="mt-2 h-2 overflow-hidden rounded-full bg-[#EDF0F5]">
                    <View className="h-full w-[70%] rounded-full bg-[#2AA6DF]" />
                  </View>
                </View>

                <View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm text-[#24314A]">Overall Match</Text>
                    <Text className="text-sm font-black text-[#284BD6]">{featuredTraveler.compatibility}%</Text>
                  </View>
                  <View className="mt-2 h-2 overflow-hidden rounded-full bg-[#EDF0F5]">
                    <View className="h-full w-[92%] rounded-full bg-[#284BD6]" />
                  </View>
                </View>
              </View>
            </View>

            <View className="mt-4 flex-row gap-2">
              <TouchableOpacity className="flex-1 rounded-2xl border border-[#D8E0EE] bg-white py-3">
                <Text className="text-center text-sm font-semibold text-[#24314A]">View Details</Text>
              </TouchableOpacity>
              <TouchableOpacity className="flex-1 rounded-2xl bg-[#284BD6] py-3">
                <Text className="text-center text-sm font-bold text-white">Connect</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="items-center gap-3 pb-4">
            <View className="flex-row items-center gap-2">
              <TouchableOpacity className="h-9 w-9 items-center justify-center rounded-full border border-[#D8E0EE] bg-white">
                <ChevronLeft size={16} color="#24314A" />
              </TouchableOpacity>

              <View className="flex-row items-center gap-1.5">
                <View className="h-2 w-2 rounded-full bg-[#284BD6]" />
                <View className="h-2 w-2 rounded-full bg-[#D6DCE8]" />
                <View className="h-2 w-2 rounded-full bg-[#D6DCE8]" />
                <View className="h-2 w-2 rounded-full bg-[#D6DCE8]" />
                <View className="h-2 w-2 rounded-full bg-[#D6DCE8]" />
              </View>

              <TouchableOpacity className="h-9 w-9 items-center justify-center rounded-full border border-[#D8E0EE] bg-white">
                <ChevronRight size={16} color="#24314A" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <View className="flex-1 justify-center bg-black/45 px-4">
          <View className="rounded-[28px] bg-white p-4 shadow-lg shadow-black/20">
            <View className="flex-row items-center justify-between">
              <View className="w-8" />
              <Text className="text-xl font-black text-[#1B2340]">Filters</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)} className="h-8 w-8 items-center justify-center rounded-full bg-[#F3F5FA]">
                <X size={16} color="#6C7A95" />
              </TouchableOpacity>
            </View>

            <View className="mt-3 self-start rounded-full bg-[#EEF2FF] px-3 py-1.5">
              <Text className="text-xs font-bold text-[#6B77F5]">0 active</Text>
            </View>

            <View className="mt-4 gap-4">
              <View>
                <Text className="text-xs font-bold uppercase tracking-[0.12em] text-[#8794A9]">Location</Text>
                <View className="mt-2 rounded-2xl border border-[#EDF0F5] bg-[#FAFBFD] px-3 py-3">
                  <Text className="text-base text-[#9CA3AF]">Paris, Tokyo, NYC...</Text>
                </View>
              </View>

              <View>
                <Text className="text-xs font-bold uppercase tracking-[0.12em] text-[#8794A9]">Travel Dates</Text>
                <View className="mt-2 flex-row gap-3">
                  <View className="flex-1 rounded-2xl border border-[#EDF0F5] bg-[#FAFBFD] px-3 py-3">
                    <Text className="text-base text-[#9CA3AF]">mm/dd/yyyy</Text>
                  </View>
                  <View className="flex-1 rounded-2xl border border-[#EDF0F5] bg-[#FAFBFD] px-3 py-3">
                    <Text className="text-base text-[#9CA3AF]">mm/dd/yyyy</Text>
                  </View>
                </View>
              </View>

              <View>
                <Text className="text-xs font-bold uppercase tracking-[0.12em] text-[#8794A9]">Budget</Text>
                <View className="mt-2 flex-row gap-2">
                  {(['Budget', 'Mid-range', 'Luxury'] as BudgetKey[]).map((budget) => (
                    <TouchableOpacity
                      key={budget}
                      onPress={() => setActiveBudget(budget)}
                      className={`flex-1 rounded-full px-3 py-2 ${activeBudget === budget ? 'bg-[#EEF2FF]' : 'bg-[#F4F6FA]'}`}
                    >
                      <Text className={`text-center text-xs font-semibold ${activeBudget === budget ? 'text-[#284BD6]' : 'text-[#6C7A95]'}`}>
                        {budget}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text className="text-xs font-bold uppercase tracking-[0.12em] text-[#8794A9]">Purpose</Text>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {purposeOptions.map((purpose) => {
                    const selected = activePurpose.includes(purpose);
                    return (
                      <TouchableOpacity
                        key={purpose}
                        onPress={() =>
                          setActivePurpose((current) =>
                            current.includes(purpose) ? current.filter((item) => item !== purpose) : [...current, purpose]
                          )
                        }
                        className={`min-w-[46%] rounded-2xl px-3 py-3 ${selected ? 'bg-[#EEF2FF]' : 'bg-[#F4F6FA]'}`}
                      >
                        <Text className={`text-center text-sm font-semibold ${selected ? 'text-[#284BD6]' : 'text-[#6C7A95]'}`}>{purpose}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold uppercase tracking-[0.12em] text-[#8794A9]">Compatibility</Text>
                  <Text className="text-sm font-bold text-[#284BD6]">{compatibility}%+</Text>
                </View>
                <View className="mt-3 h-2 overflow-hidden rounded-full bg-[#DCE4F3]">
                  <View className="h-full rounded-full bg-[#284BD6]" style={{ width: `${compatibility}%` }} />
                </View>
              </View>

              <View className="rounded-2xl border border-[#EDF0F5] bg-[#FAFBFD] px-3 py-3">
                <Text className="text-sm text-[#6C7A95]">Carpool available</Text>
              </View>

              <View className="flex-row gap-3 pt-1">
                <TouchableOpacity className="flex-1 rounded-2xl border border-[#D8E0EE] bg-white py-3">
                  <Text className="text-center text-sm font-semibold text-[#24314A]">Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setFilterOpen(false)} className="flex-1 rounded-2xl bg-[#284BD6] py-3">
                  <Text className="text-center text-sm font-bold text-white">Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
