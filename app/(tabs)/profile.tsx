import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import { AvatarFrame } from '@/components/cosmetics/AvatarFrame';
import { ProfileBanner } from '@/components/cosmetics/ProfileBanner';
import { UserRankTag } from '@/components/guild/UserRankTag';
import { enterFromBelow } from '@/components/ui/motion';
import { useHideTabBarOnScroll } from '@/components/ui/tab-bar-visibility';
import { useAuth } from '@/hooks/auth-provider';
import { formatResidence } from '@/lib/bulacan';
import { uploadAvatar } from '@/lib/avatar';
import { getLoadout, type Loadout } from '@/lib/cosmetics';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { feedback } from '@/lib/sounds';
import { getTheme, typography } from '@/lib/theme';
import { getProfileStats, listUserReviews, type ProfileStats, type UserReview } from '@/lib/ratings';
import { countUnreadTickets } from '@/lib/support';
import { listTrustedContacts, type TrustedContact } from '@/lib/trustedCircle';
import { getMyVerification, type IdVerification } from '@/lib/verification';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Cake,
  Camera,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cog,
  Compass,
  Flag,
  LifeBuoy,
  LogOut,
  MapPin,
  MapPinned,
  Palette,
  Pencil,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Star,
  Trophy,
  Users,
} from 'lucide-react-native';
import { useCallback, useState, type ComponentType } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { showAlert } from '@/lib/dialog';
type IconType = ComponentType<{ size?: number; color?: string; fill?: string }>;

function formatRelativeDate(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

function StarRow({ rating, size }: { rating: number; size: number }) {
  const isDark = useColorScheme() === 'dark';
  const rounded = Math.round(rating);
  return (
    <View className="flex-row items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={size} color={index < rounded ? '#F4B400' : isDark ? '#334155' : '#CBD5E1'} fill={index < rounded ? '#F4B400' : 'transparent'} />
      ))}
    </View>
  );
}

function SectionCard({ children, index = 0, className = '' }: { children: React.ReactNode; index?: number; className?: string }) {
  const isDark = useColorScheme() === 'dark';
  return (
    <Animated.View
      entering={enterFromBelow(index)}
      className={`rounded-[28px] border p-5 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E9EDF5] bg-white'} ${className}`}
      style={{ shadowColor: '#0F1B3D', shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: isDark ? 0 : 2 }}>
      {children}
    </Animated.View>
  );
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const isDark = useColorScheme() === 'dark';
  return (
    <View className="flex-row items-center justify-between">
      <Text className={`text-[17px] font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-[#182847]'}`}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} hitSlop={8} className="flex-row items-center gap-0.5">
          <Text className="text-[13px] font-bold" style={{ color: isDark ? '#8FA8FF' : '#2647B8' }}>{action}</Text>
          <ChevronRight size={14} color={isDark ? '#8FA8FF' : '#2647B8'} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function MetaChip({ icon: Icon, label }: { icon: IconType; label: string }) {
  const isDark = useColorScheme() === 'dark';
  return (
    <View className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5" style={{ backgroundColor: isDark ? '#1A2539' : '#F2F4F9' }}>
      <Icon size={13} color={isDark ? '#94A3B8' : '#67748D'} />
      <Text className={`text-[13px] font-semibold ${isDark ? 'text-[#CBD5E1]' : 'text-[#4A5875]'}`}>{label}</Text>
    </View>
  );
}

function StatTile({ icon: Icon, value, label, tint, onPress }: { icon: IconType; value: number; label: string; tint: string; onPress: () => void }) {
  const isDark = useColorScheme() === 'dark';
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} accessibilityLabel={`${label}: ${value}`} className="flex-1">
      <View className="rounded-[20px] p-3.5" style={{ backgroundColor: isDark ? '#18253C' : '#F7F8FC' }}>
        <View className="flex-row items-start justify-between">
          <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${tint}1F` }}>
            <Icon size={18} color={tint} />
          </View>
          <ChevronRight size={16} color={isDark ? '#475569' : '#A3AEC2'} />
        </View>
        <Text className={`mt-3 text-[24px] font-black tracking-tight ${isDark ? 'text-white' : 'text-[#182847]'}`}>{value}</Text>
        <Text className={`text-[12.5px] font-semibold ${isDark ? 'text-[#94A3B8]' : 'text-[#67748D]'}`}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

function MenuRow({
  icon: Icon,
  tint,
  label,
  subtitle,
  badge,
  onPress,
  last,
  accessibilityLabel,
}: {
  icon: IconType;
  tint: string;
  label: string;
  subtitle?: string;
  badge?: number;
  onPress: () => void;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  const isDark = useColorScheme() === 'dark';
  return (
    <View>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityLabel={accessibilityLabel ?? label} className="flex-row items-center gap-3.5 py-3.5">
        <View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: `${tint}1F` }}>
          <Icon size={19} color={tint} />
        </View>
        <View className="flex-1">
          <Text className={`text-[15px] font-semibold ${isDark ? 'text-white' : 'text-[#182847]'}`}>{label}</Text>
          {subtitle ? <Text className={`mt-0.5 text-[12.5px] ${isDark ? 'text-[#94A3B8]' : 'text-[#67748D]'}`}>{subtitle}</Text> : null}
        </View>
        {badge ? (
          <View className="min-w-[22px] items-center rounded-full bg-[#DC2626] px-1.5 py-0.5">
            <Text className="text-[11px] font-black text-white">{badge}</Text>
          </View>
        ) : null}
        <ChevronRight size={18} color={isDark ? '#475569' : '#A3AEC2'} />
      </TouchableOpacity>
      {last ? null : <View className="ml-[54px] h-px" style={{ backgroundColor: isDark ? '#1E2A40' : '#EEF1F7' }} />}
    </View>
  );
}

export default function ProfileScreen() {
  const hideTabBarOnScroll = useHideTabBarOnScroll();
  const router = useRouter();
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [verification, setVerification] = useState<IdVerification | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [loadout, setLoadout] = useState<Loadout>({ banner: null, frame: null });
  const [unreadTickets, setUnreadTickets] = useState(0);
  const isDark = useColorScheme() === 'dark';
  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F4F6FB]';
  const { titleColor } = getTheme(isDark);
  const textPrimary = isDark ? 'text-white' : 'text-[#182847]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const cardBorder = isDark ? 'border-[#111B2E]' : 'border-white';
  const profileAge = profile?.date_of_birth ? Math.max(0, new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear() - (new Date() < new Date(new Date().getFullYear(), new Date(profile.date_of_birth).getMonth(), new Date(profile.date_of_birth).getDate()) ? 1 : 0)) : null;
  const confirmedTrustedContacts = trustedContacts.filter((contact) => contact.status === 'accepted');
  const userId = session?.user.id;
  const location = formatResidence(profile?.city);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  async function handleChangeAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission needed', 'Photo library access is needed to set a profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    setAvatarUploading(true);
    const { error } = await uploadAvatar(result.assets[0].uri);
    if (error) {
      feedback.error();
      showAlert('Upload failed', error.message);
    } else {
      await refreshProfile();
      feedback.success();
    }
    setAvatarUploading(false);
  }

  const loadProfile = useCallback(
    () =>
      Promise.all([
        refreshProfile(),
        listTrustedContacts().then((result) => {
          if (!result.error) {
            setTrustedContacts(result.data);
          }
        }),
        getMyVerification().then((result) => {
          if (!result.error) {
            setVerification(result.data);
          }
        }),
        userId
          ? getProfileStats(userId).then((result) => {
              if (!result.error) {
                setStats(result.data);
              }
            })
          : null,
        userId ? getLoadout(userId).then(setLoadout) : null,
        countUnreadTickets().then(setUnreadTickets),
        userId
          ? listUserReviews(userId, 5).then((result) => {
              if (!result.error) {
                setReviews(result.data);
              }
            })
          : null,
      ]),
    [refreshProfile, userId]
  );
  const { refreshControl } = usePullToRefresh(loadProfile);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const verificationStatus =
    verification?.status === 'pending' || verification?.status === 'resubmitted'
      ? 'pending'
      : profile?.verification_status ?? 'unverified';
  const verificationStyle = {
    approved: { icon: CheckCircle2, tint: '#00A56A', label: 'Verified' },
    pending: { icon: Clock, tint: '#D88700', label: 'Pending review' },
    rejected: { icon: ShieldAlert, tint: '#DC2626', label: 'Rejected' },
    unverified: { icon: Shield, tint: '#6B7590', label: 'Not verified' },
  }[verificationStatus];
  const VerificationIcon = verificationStyle.icon;

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} refreshControl={refreshControl} {...hideTabBarOnScroll}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
        <Text className={`${typography.pageTitle} ${titleColor}`}>Profile</Text>
        <TouchableOpacity
          onPress={() => router.push('/modal')}
          accessibilityLabel="Settings"
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: isDark ? '#18253C' : '#FFFFFF' }}>
          <Cog size={20} color={isDark ? '#E2E8F0' : '#2647B8'} />
        </TouchableOpacity>
      </View>

      <View className="gap-4 px-4 pt-2">
        {/* Hero */}
        <SectionCard index={0} className="p-0">
          <ProfileBanner bannerKey={loadout.banner} height={120} className="items-end rounded-t-[28px] p-3">
            <TouchableOpacity
              onPress={() => router.push('/rewards')}
              activeOpacity={0.8}
              className="flex-row items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5"
              accessibilityLabel="Change your profile banner and frame">
              <Palette size={13} color="#FFFFFF" />
              <Text className="text-xs font-bold text-white">Customize</Text>
            </TouchableOpacity>
          </ProfileBanner>

          <View className="-mt-12 items-center px-5 pb-5">
            <TouchableOpacity onPress={handleChangeAvatar} disabled={avatarUploading} activeOpacity={0.8} accessibilityLabel="Change profile photo">
              <AvatarFrame frameKey={loadout.frame} size={96}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} className={`h-24 w-24 rounded-full border-4 ${cardBorder}`} />
                ) : (
                  <View className={`h-24 w-24 items-center justify-center rounded-full border-4 ${cardBorder} ${isDark ? 'bg-[#18253C]' : 'bg-[#E3EBFF]'}`}>
                    <Text className={`text-[38px] font-black ${isDark ? 'text-[#94A3B8]' : 'text-[#2647B8]'}`}>{profile?.display_name?.trim().charAt(0).toUpperCase() ?? ''}</Text>
                  </View>
                )}
              </AvatarFrame>
              {avatarUploading ? (
                <View className="absolute inset-0 items-center justify-center rounded-full bg-black/50">
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
              <View className={`absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-[3px] bg-[#2747C7] ${cardBorder}`}>
                <Camera size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            <View className="mt-3 max-w-full flex-row items-center justify-center gap-1.5 px-2">
              <Text className={`shrink text-center text-[24px] font-black tracking-tight ${textPrimary}`} numberOfLines={2}>{profile?.display_name ?? ''}</Text>
              {profile?.verification_status === 'approved' ? <ShieldCheck size={20} color="#00A56A" /> : null}
            </View>

            <TouchableOpacity onPress={() => router.push('/guild')} activeOpacity={0.8} className="mt-1.5" accessibilityLabel="Open your guild rank">
              <UserRankTag userId={profile?.id} isDark={isDark} variant="title" role={profile?.role} />
            </TouchableOpacity>

            <View className="mt-3 flex-row flex-wrap justify-center gap-2">
              {profileAge ? <MetaChip icon={Cake} label={`${profileAge} yrs`} /> : null}
              {location ? <MetaChip icon={MapPin} label={location} /> : null}
              <View className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5" style={{ backgroundColor: isDark ? '#2B2410' : '#FFF6DB' }}>
                <Star size={13} color="#F4B400" fill="#F4B400" />
                <Text className="text-[13px] font-bold" style={{ color: isDark ? '#FCD34D' : '#9A6B00' }}>
                  {stats?.rating_count && stats.avg_rating != null
                    ? `${stats.avg_rating.toFixed(1)} · ${stats.rating_count} ${stats.rating_count === 1 ? 'review' : 'reviews'}`
                    : 'No ratings yet'}
                </Text>
              </View>
            </View>

            {profile?.bio?.trim() ? (
              <Text className={`mt-4 text-center text-[15px] leading-6 ${isDark ? 'text-[#CBD5E1]' : 'text-[#3B4763]'}`}>{profile.bio.trim()}</Text>
            ) : (
              <Text className={`mt-4 text-[14px] italic ${textSecondary}`}>No bio yet.</Text>
            )}

            <View className="mt-5 flex-row gap-2.5 self-stretch">
              <TouchableOpacity
                onPress={() => router.push('/edit-profile')}
                activeOpacity={0.85}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2747C7] py-3.5">
                <Pencil size={16} color="#FFFFFF" />
                <Text className="text-[15px] font-bold text-white">Edit Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/friends')}
                activeOpacity={0.85}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3.5"
                style={{ backgroundColor: isDark ? '#18253C' : '#EEF2FF' }}>
                <Users size={16} color={isDark ? '#E2E8F0' : '#2647B8'} />
                <Text className={`text-[15px] font-bold ${isDark ? 'text-[#E2E8F0]' : 'text-[#2647B8]'}`}>Friends</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SectionCard>

        {/* Travel stats */}
        <SectionCard index={1}>
          <SectionTitle title="Travel Experience" action="View all" onAction={() => router.push('/trip-history')} />
          <View className="mt-4 gap-2.5">
            <View className="flex-row gap-2.5">
              <StatTile icon={Flag} value={stats?.trips_completed ?? 0} label="Trips completed" tint="#2747C7" onPress={() => router.push({ pathname: '/trip-history', params: { filter: 'all' } })} />
              <StatTile icon={MapPinned} value={stats?.places_visited ?? 0} label="Places visited" tint="#00A56A" onPress={() => router.push({ pathname: '/trip-history', params: { filter: 'places' } })} />
            </View>
            <View className="flex-row gap-2.5">
              <StatTile icon={Car} value={stats?.carpools_completed ?? 0} label="Carpools" tint="#D88700" onPress={() => router.push({ pathname: '/trip-history', params: { filter: 'carpool' } })} />
              <StatTile icon={Compass} value={stats?.tours_completed ?? 0} label="Tours" tint="#8B5CF6" onPress={() => router.push({ pathname: '/trip-history', params: { filter: 'tour' } })} />
            </View>
          </View>
        </SectionCard>

        {/* Verification */}
        <SectionCard index={2}>
          <View className="flex-row items-center gap-3.5">
            <View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${verificationStyle.tint}1F` }}>
              <VerificationIcon size={22} color={verificationStyle.tint} />
            </View>
            <View className="flex-1">
              <Text className={`text-[16px] font-extrabold ${textPrimary}`}>ID Verification</Text>
              <View className="mt-1 flex-row">
                <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: `${verificationStyle.tint}1F` }}>
                  <Text className="text-[12px] font-bold" style={{ color: verificationStyle.tint }}>{verificationStyle.label}</Text>
                </View>
              </View>
            </View>
          </View>

          {verificationStatus === 'approved' ? (
            <Text className={`mt-3 text-[14px] leading-5 ${textSecondary}`}>Your identity is verified. You can create and join trips.</Text>
          ) : null}
          {verificationStatus === 'pending' ? (
            <Text className={`mt-3 text-[14px] leading-5 ${textSecondary}`}>Your documents are under review. This usually takes 1-2 hours.</Text>
          ) : null}
          {verificationStatus === 'rejected' && verification?.reviewer_notes ? (
            <Text className="mt-3 text-[14px] leading-5 text-[#DC2626]">Reason: {verification.reviewer_notes}</Text>
          ) : null}
          {verificationStatus === 'unverified' || verificationStatus === 'rejected' ? (
            <TouchableOpacity onPress={() => router.push('/verify-id')} activeOpacity={0.85} className="mt-4 items-center rounded-2xl bg-[#2747C7] py-3.5">
              <Text className="text-[15px] font-bold text-white">{verificationStatus === 'rejected' ? 'Resubmit Documents' : 'Verify Now'}</Text>
            </TouchableOpacity>
          ) : null}
        </SectionCard>

        {/* Interests */}
        <SectionCard index={3}>
          <SectionTitle title="Interests" action="Edit" onAction={() => router.push('/edit-profile')} />
          <View className="mt-4 flex-row flex-wrap gap-2">
            {profile?.interests?.length ? (
              profile.interests.map((interest) => (
                <View key={interest} className="rounded-full border px-3.5 py-1.5" style={{ borderColor: isDark ? '#2C3E5F' : '#DCE4FB', backgroundColor: isDark ? '#18253C' : '#F3F6FF' }}>
                  <Text className="text-[14px] font-semibold" style={{ color: isDark ? '#C7D2FE' : '#2647B8' }}>{interest}</Text>
                </View>
              ))
            ) : (
              <Text className={`text-[14px] ${textSecondary}`}>No interests selected yet.</Text>
            )}
          </View>
        </SectionCard>

        {/* Trusted circle + SOS */}
        <SectionCard index={4}>
          <SectionTitle title="Trusted Circle" action="Manage" onAction={() => router.push('/trusted-circle')} />
          <View className="mt-3">
            {confirmedTrustedContacts.length ? (
              confirmedTrustedContacts.slice(0, 3).map((contact, index) => (
                <View key={contact.id} className={`flex-row items-center gap-3 py-2.5 ${index > 0 ? `border-t ${isDark ? 'border-[#22324B]' : 'border-[#E8ECF3]'}` : ''}`}>
                  <View className={`h-10 w-10 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#E3EBFF]'}`}>
                    <Text className={`text-[15px] font-black ${isDark ? 'text-[#94A3B8]' : 'text-[#2647B8]'}`}>{contact.display_name?.trim().charAt(0).toUpperCase()}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className={`text-[15px] font-semibold ${textPrimary}`}>{contact.display_name}</Text>
                    <Text className={`text-[13px] ${textSecondary}`}>{contact.relationship}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text className={`text-[14px] ${textSecondary}`}>No confirmed emergency contacts yet.</Text>
            )}
          </View>

          <View className="mt-4 rounded-[20px] p-4" style={{ backgroundColor: isDark ? '#2A1215' : '#FFF1F1' }}>
            <View className="flex-row items-center gap-2">
              <Siren size={18} color="#E32727" />
              <Text className="text-[15px] font-extrabold" style={{ color: isDark ? '#FCA5A5' : '#B91C1C' }}>Emergency SOS</Text>
            </View>
            <Text className="mt-1.5 text-[13.5px] leading-5" style={{ color: isDark ? '#F5C2C2' : '#8F2D2D' }}>
              When you activate SOS, your location is shared with your trusted circle and our safety team.
            </Text>
            <TouchableOpacity onPress={() => router.push('/trusted-circle')} activeOpacity={0.85} className="mt-3 items-center rounded-2xl bg-[#E32727] py-3">
              <Text className="text-[14px] font-bold text-white">{confirmedTrustedContacts.length ? 'Manage Emergency Contacts' : 'Add Emergency Contact'}</Text>
            </TouchableOpacity>
          </View>
        </SectionCard>

        {/* Reviews */}
        <SectionCard index={5}>
          <SectionTitle title="Recent Reviews" />
          <View className="mt-3 gap-3">
            {reviews.length ? (
              reviews.map((review) => (
                <View key={review.id} className="rounded-[18px] p-3.5" style={{ backgroundColor: isDark ? '#18253C' : '#F7F8FC' }}>
                  <View className="flex-row items-center gap-2.5">
                    <View className={`h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#E3EBFF]'}`}>
                      <Text className={`text-[13px] font-black ${isDark ? 'text-[#94A3B8]' : 'text-[#2647B8]'}`}>{review.author_name?.trim().charAt(0).toUpperCase()}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className={`text-[14px] font-semibold ${textPrimary}`} numberOfLines={1}>{review.author_name}</Text>
                      <StarRow rating={review.rating} size={12} />
                    </View>
                    <Text className={`text-[12px] ${textSecondary}`}>{formatRelativeDate(review.created_at)}</Text>
                  </View>
                  {review.comment ? <Text className={`mt-2.5 text-[14px] leading-5 ${isDark ? 'text-[#CBD5E1]' : 'text-[#3B4763]'}`}>{review.comment}</Text> : null}
                </View>
              ))
            ) : (
              <Text className={`text-[14px] ${textSecondary}`}>No reviews yet. Travelers can rate you after a completed trip.</Text>
            )}
          </View>
        </SectionCard>

        {/* Menu */}
        <SectionCard index={6} className="py-1">
          <MenuRow icon={Trophy} tint="#D88700" label="My Guild & Rewards" subtitle="Rank, missions and cosmetics" onPress={() => router.push('/guild')} />
          <MenuRow icon={Car} tint="#2747C7" label="My Vehicles" subtitle="Manage cars for carpooling" onPress={() => router.push('/vehicles')} />
          <MenuRow
            icon={LifeBuoy}
            tint="#00A56A"
            label="Help & Reports"
            subtitle="Support tickets and safety reports"
            badge={unreadTickets}
            accessibilityLabel={unreadTickets > 0 ? `Help and Reports, ${unreadTickets} new replies` : 'Help and Reports'}
            onPress={() => router.push('/support')}
          />
          <MenuRow icon={LogOut} tint="#E32727" label="Log Out" onPress={() => setShowLogoutConfirm(true)} last />
        </SectionCard>

        <LogoutConfirmModal visible={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} onConfirm={signOut} isDark={isDark} />
      </View>
    </ScrollView>
  );
}
