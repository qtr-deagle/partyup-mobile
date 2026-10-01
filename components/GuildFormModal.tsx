import { GuildEmblem } from '@/components/GuildEmblem';
import { RankMedal } from '@/components/guild/RankMedal';
import { riseIn } from '@/components/ui/motion';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { BULACAN_MUNICIPALITIES, type BulacanMunicipality } from '@/lib/bulacan';
import {
  GUILD_COLORS,
  GUILD_EMBLEMS,
  GUILD_FOCUS_MAX,
  GUILD_FOCUS_OPTIONS,
  GUILD_BASE_MEMBERS,
  GUILD_MAX_MEMBERS,
  GUILD_MEMBERS_PER_LEVEL,
  GUILD_MIN_RANKS,
  GUILD_NAME_IDEAS,
  formatGuildAreas,
  RANKS,
  type Guild,
  type GuildEmblem as Emblem,
  type GuildFocus,
  type JoinPolicy,
  type MinRank,
} from '@/lib/guilds';
import { DoorOpen, ShieldCheck, Users, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

export type GuildFormValues = {
  name: string;
  tagline: string;
  emblem: Emblem;
  color: string;
  joinPolicy: JoinPolicy;
  minRank: MinRank | null;
  description: string;
  areas: BulacanMunicipality[];
  focus: GuildFocus[];
};

const JOIN_OPTIONS: { id: JoinPolicy; label: string; hint: string }[] = [
  { id: 'approval', label: 'Approval required', hint: 'Travelers send a request; you accept or decline it.' },
  { id: 'open', label: 'Open to all', hint: 'Any verified traveler can join instantly.' },
];

type Props = {
  visible: boolean;
  isDark: boolean;
  // Present when editing; absent when founding a new guild.
  guild?: Guild | null;
  busy: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (values: GuildFormValues) => void;
};

export function GuildFormModal({ visible, isDark, guild, busy, errorMessage, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [emblem, setEmblem] = useState<Emblem>('shield');
  const [color, setColor] = useState(GUILD_COLORS[0]);
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>('approval');
  const [minRank, setMinRank] = useState<MinRank | null>(null);
  const [description, setDescription] = useState('');
  const [areas, setAreas] = useState<BulacanMunicipality[]>([]);
  const [focus, setFocus] = useState<GuildFocus[]>([]);

  useEffect(() => {
    if (!visible) return;
    setName(guild?.name ?? '');
    setTagline(guild?.tagline ?? '');
    setEmblem(guild?.emblem ?? 'shield');
    setColor(guild?.color ?? GUILD_COLORS[0]);
    setJoinPolicy(guild?.join_policy ?? 'approval');
    setMinRank(guild?.min_rank ?? null);
    setDescription(guild?.description ?? '');
    setAreas(guild?.areas ?? []);
    setFocus(guild?.focus ?? []);
  }, [visible, guild]);

  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const input = isDark ? 'border-[#22324B] bg-[#18253C] text-white' : 'border-[#DCE3EF] bg-[#F4F6FA] text-[#1B2340]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';
  const chip = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#DCE3EF] bg-[#F4F6FA]';
  const trimmed = name.trim();
  const canSubmit = trimmed.length >= 3 && trimmed.length <= 30 && !busy;
  const minRankPoints = minRank ? RANKS.find((rank) => rank.name === minRank)?.min : null;

  function toggleFocus(id: GuildFocus) {
    setFocus((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length >= GUILD_FOCUS_MAX ? current : [...current, id]));
  }

  function toggleArea(area: BulacanMunicipality) {
    // Kept in list order so the summary reads the same every time.
    setAreas((current) => (current.includes(area) ? current.filter((item) => item !== area) : BULACAN_MUNICIPALITIES.filter((item) => item === area || current.includes(item))));
  }

  // Selected chips take the guild color, like the join policy buttons.
  function chipStyle(selected: boolean) {
    return selected ? { borderColor: color, backgroundColor: `${color}1F` } : undefined;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 items-center justify-center bg-black/45 px-4">
        <Animated.View
          entering={riseIn(0, 380)}
          className={`max-h-[90%] w-full max-w-[440px] rounded-[28px] px-4 py-5 shadow-lg shadow-black/25 ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}>
          <View className="flex-row items-start justify-between gap-4 pb-3">
            <View className="flex-1">
              <Text className={`text-headline-24 font-bold ${primary}`}>{guild ? 'Edit Guild' : 'Found Your Guild'}</Text>
              <Text className={`mt-1 text-[14px] ${secondary}`}>Pick a name travelers will want to rally behind.</Text>
            </View>
            <TouchableOpacity onPress={onClose} className={`h-9 w-9 items-center justify-center rounded-full ${chip}`} accessibilityLabel="Close">
              <X size={18} color={isDark ? '#CBD5E1' : '#6B7590'} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 pb-2">
            <View className="items-center pt-1">
              <GuildEmblem emblem={emblem} color={color} size={64} />
              <Text className={`mt-2 text-lg font-black ${primary}`}>{trimmed || 'Your guild name'}</Text>
            </View>

            <View>
              <Text className={`mb-1.5 text-sm font-semibold ${primary}`}>Guild name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={30}
                placeholder="e.g. Malolos Wanderers"
                placeholderTextColor={placeholderColor}
                className={`rounded-xl border px-4 py-3 text-[15px] ${input}`}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pt-2">
                {GUILD_NAME_IDEAS.map((idea) => (
                  <TouchableOpacity key={idea} onPress={() => setName(idea)} className={`rounded-full border px-3 py-1.5 ${chip}`}>
                    <Text className={`text-xs font-semibold ${secondary}`}>{idea}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View>
              <Text className={`mb-1.5 text-sm font-semibold ${primary}`}>Motto (optional)</Text>
              <TextInput
                value={tagline}
                onChangeText={setTagline}
                maxLength={80}
                placeholder="e.g. Safe rides, good vibes"
                placeholderTextColor={placeholderColor}
                className={`rounded-xl border px-4 py-3 text-[15px] ${input}`}
              />
            </View>

            <View>
              <Text className={`mb-2 text-sm font-semibold ${primary}`}>Emblem</Text>
              <View className="flex-row flex-wrap gap-2.5">
                {GUILD_EMBLEMS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setEmblem(option)}
                    accessibilityLabel={`Emblem ${option}`}
                    className="rounded-full p-0.5"
                    style={{ borderWidth: 2, borderColor: emblem === option ? color : 'transparent' }}>
                    <GuildEmblem emblem={option} color={emblem === option ? color : isDark ? '#334155' : '#94A3B8'} size={40} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text className={`mb-2 text-sm font-semibold ${primary}`}>Color</Text>
              <View className="flex-row flex-wrap gap-2.5">
                {GUILD_COLORS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setColor(option)}
                    accessibilityLabel={`Color ${option}`}
                    className="h-9 w-9 rounded-full"
                    style={{ backgroundColor: option, borderWidth: 3, borderColor: color === option ? (isDark ? '#FFFFFF' : '#1B2340') : 'transparent' }}
                  />
                ))}
              </View>
            </View>

            <View>
              <Text className={`mb-1.5 text-sm font-semibold ${primary}`}>About (optional)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                maxLength={300}
                multiline
                placeholder="What your guild is about, the trips you run, house rules…"
                placeholderTextColor={placeholderColor}
                className={`min-h-[90px] rounded-xl border px-4 py-3 text-[15px] ${input}`}
                style={{ textAlignVertical: 'top' }}
              />
              <Text className={`mt-1 text-right text-[11px] ${secondary}`}>{description.length}/300</Text>
            </View>

            <View>
              <View className="mb-2 flex-row items-center justify-between">
                <Text className={`text-sm font-semibold ${primary}`}>Travel focus</Text>
                <Text className={`text-xs ${secondary}`}>
                  {focus.length}/{GUILD_FOCUS_MAX}
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {GUILD_FOCUS_OPTIONS.map((option) => {
                  const selected = focus.includes(option.id);
                  const full = !selected && focus.length >= GUILD_FOCUS_MAX;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      onPress={() => toggleFocus(option.id)}
                      disabled={full}
                      accessibilityLabel={option.label}
                      className={`rounded-full border px-3 py-1.5 ${selected ? '' : chip}`}
                      style={[chipStyle(selected), full ? { opacity: 0.45 } : null]}>
                      <Text className={`text-xs font-bold ${selected ? primary : secondary}`}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View className={`h-px ${isDark ? 'bg-[#22324B]' : 'bg-[#E2E8F0]'}`} />
            <Text className={`-mb-2 text-xs font-black uppercase tracking-[2px] ${secondary}`}>Joining rules</Text>

            <View>
              <Text className={`mb-2 text-sm font-semibold ${primary}`}>Who can join</Text>
              <View className="flex-row gap-2">
                {JOIN_OPTIONS.map((option) => {
                  const selected = joinPolicy === option.id;
                  const Icon = option.id === 'approval' ? ShieldCheck : DoorOpen;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      onPress={() => setJoinPolicy(option.id)}
                      accessibilityLabel={option.label}
                      className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border py-2.5 ${selected ? '' : chip}`}
                      style={selected ? { borderColor: color, backgroundColor: `${color}1F` } : undefined}>
                      <Icon size={15} color={selected ? color : isDark ? '#94A3B8' : '#6C7A95'} />
                      <Text className={`text-xs font-bold ${selected ? primary : secondary}`}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text className={`mt-1.5 text-xs ${secondary}`}>{JOIN_OPTIONS.find((option) => option.id === joinPolicy)?.hint}</Text>
            </View>

            <View>
              <Text className={`mb-2 text-sm font-semibold ${primary}`}>Minimum rank</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                <TouchableOpacity
                  onPress={() => setMinRank(null)}
                  accessibilityLabel="Any rank"
                  className={`items-center justify-center rounded-xl border px-3.5 py-2 ${minRank === null ? '' : chip}`}
                  style={chipStyle(minRank === null)}>
                  <Users size={22} color={minRank === null ? color : isDark ? '#94A3B8' : '#6C7A95'} />
                  <Text className={`mt-1 text-xs font-bold ${minRank === null ? primary : secondary}`}>Anyone</Text>
                </TouchableOpacity>
                {GUILD_MIN_RANKS.map((rank) => {
                  const selected = minRank === rank;
                  return (
                    <TouchableOpacity
                      key={rank}
                      onPress={() => setMinRank(rank)}
                      accessibilityLabel={`${rank} rank and up`}
                      className={`items-center justify-center rounded-xl border px-3 py-2 ${selected ? '' : chip}`}
                      style={chipStyle(selected)}>
                      <RankMedal rank={rank} size={24} />
                      <Text className={`mt-1 text-xs font-bold ${selected ? primary : secondary}`}>{rank}+</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text className={`mt-1.5 text-xs ${secondary}`}>
                {minRank
                  ? `Only travelers at ${minRank} rank (${minRankPoints}+ pts) or higher can join or request to join. Current members stay.`
                  : 'Travelers of any rank can join.'}
              </Text>
            </View>

            <View>
              <View className="mb-2 flex-row items-center justify-between">
                <Text className={`text-sm font-semibold ${primary}`}>Member locations</Text>
                {areas.length > 0 ? (
                  <TouchableOpacity onPress={() => setAreas([])} accessibilityLabel="Allow all of Bulacan">
                    <Text className="text-xs font-bold" style={{ color }}>
                      Clear
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View className="flex-row flex-wrap gap-2">
                <TouchableOpacity
                  onPress={() => setAreas([])}
                  accessibilityLabel="All of Bulacan"
                  className={`rounded-full border px-3 py-1.5 ${areas.length === 0 ? '' : chip}`}
                  style={chipStyle(areas.length === 0)}>
                  <Text className={`text-xs font-bold ${areas.length === 0 ? primary : secondary}`}>All of Bulacan</Text>
                </TouchableOpacity>
                {BULACAN_MUNICIPALITIES.map((area) => {
                  const selected = areas.includes(area);
                  return (
                    <TouchableOpacity
                      key={area}
                      onPress={() => toggleArea(area)}
                      accessibilityLabel={area}
                      accessibilityState={{ selected }}
                      className={`rounded-full border px-3 py-1.5 ${selected ? '' : chip}`}
                      style={chipStyle(selected)}>
                      <Text className={`text-xs font-bold ${selected ? primary : secondary}`}>{area}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text className={`mt-1.5 text-xs ${secondary}`}>
                {areas.length > 0
                  ? `Only travelers whose verified city is ${formatGuildAreas(areas)} can join. Current members stay.`
                  : 'Travelers from anywhere in Bulacan can join. Pick one or more to limit it.'}
              </Text>
            </View>

            <Text className={`text-xs ${secondary}`}>
              Guilds hold {GUILD_BASE_MEMBERS} members at Level 1, +{GUILD_MEMBERS_PER_LEVEL} per level (max {GUILD_MAX_MEMBERS}).
            </Text>

            {errorMessage ? (
              <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
                <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
              </View>
            ) : null}

            <AnimatedPressable
              onPress={() =>
                onSubmit({
                  name: trimmed,
                  tagline: tagline.trim(),
                  emblem,
                  color,
                  joinPolicy,
                  minRank,
                  description: description.trim(),
                  areas,
                  focus,
                })
              }
              disabled={!canSubmit}
              className={`flex-row items-center justify-center gap-2 rounded-2xl py-3.5 ${canSubmit ? 'bg-[#284BD6]' : 'bg-[#94A3B8]'}`}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text className="text-base font-bold text-white">{guild ? 'Save changes' : 'Found guild (+50 pts)'}</Text>
            </AnimatedPressable>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
