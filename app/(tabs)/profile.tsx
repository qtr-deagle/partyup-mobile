import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getTheme, typography } from '@/lib/theme';
import { getProfileStats, listUserReviews, type ProfileStats, type UserReview } from '@/lib/ratings';
import { listTrustedContacts, type TrustedContact } from '@/lib/trustedCircle';
import { getMyVerification, type IdVerification } from '@/lib/verification';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertCircle, Car, CheckCircle2, Clock, Cog, LogOut, Shield, ShieldAlert, ShieldCheck, Star, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';

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
    <View className="flex-row items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={size} color={index < rounded ? '#F4B400' : isDark ? '#334155' : '#CBD5E1'} fill={index < rounded ? '#F4B400' : 'transparent'} />
      ))}
    </View>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  const isDark = useColorScheme() === 'dark';
  return <View className={`rounded-[22px] border p-4 shadow-sm ${isDark ? 'border-[#22324B] bg-[#111B2E] shadow-black/20' : 'border-[#E9EDF5] bg-white shadow-black/5'}`}>{children}</View>;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [verification, setVerification] = useState<IdVerification | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const isDark = useColorScheme() === 'dark';
  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F7F8FC]';
  const headerBackground = isDark ? 'border-[#1E293B] bg-[#0F172A]' : 'border-[#E5EAF2] bg-white';
  const { titleColor } = getTheme(isDark);
  const textPrimary = isDark ? 'text-white' : 'text-[#182847]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const softFill = isDark ? 'bg-[#18253C]' : 'bg-[#F2F4F8]';
  const profileAge = profile?.date_of_birth ? Math.max(0, new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear() - (new Date() < new Date(new Date().getFullYear(), new Date(profile.date_of_birth).getMonth(), new Date(profile.date_of_birth).getDate()) ? 1 : 0)) : null;
  const confirmedTrustedContacts = trustedContacts.filter((contact) => contact.status === 'accepted');
  const userId = session?.user.id;
  const location = [profile?.city, profile?.country].filter(Boolean).join(', ');
  const emailVerified = Boolean(session?.user.email_confirmed_at);

  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
      void listTrustedContacts().then((result) => {
        if (!result.error) {
          setTrustedContacts(result.data);
        }
      });
      void getMyVerification().then((result) => {
        if (!result.error) {
          setVerification(result.data);
        }
      });
      if (userId) {
        void getProfileStats(userId).then((result) => {
          if (!result.error) {
            setStats(result.data);
          }
        });
        void listUserReviews(userId, 5).then((result) => {
          if (!result.error) {
            setReviews(result.data);
          }
        });
      }
    }, [refreshProfile, userId])
  );

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-28">
      <View className={`border-b px-4 py-4 ${headerBackground}`}>
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.push('/modal')} className="h-10 w-10 items-center justify-center rounded-full">
            <Cog size={22} color={isDark ? '#E2E8F0' : '#2647B8'} />
          </TouchableOpacity>
          <Text className={`${typography.pageTitle} ${titleColor}`}>Profile</Text>
          <View className="h-10 w-10" />
        </View>
      </View>

      <View className="px-4 pt-4 gap-5">
        <SectionCard>
          <View className="items-center">
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} className="h-28 w-28 rounded-full" />
            ) : (
              <View className={`h-28 w-28 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#D5E4EE]'}`}>
                <Text className={`text-[40px] font-bold ${isDark ? 'text-[#94A3B8]' : 'text-[#2647B8]'}`}>{profile?.display_name?.trim().charAt(0).toUpperCase() ?? ''}</Text>
              </View>
            )}

            <View className="mt-6 flex-row items-center gap-2">
              <Text className={`text-headline-28 font-bold ${textPrimary}`}>{profile?.display_name ?? ''}</Text>
              {profile?.verification_status === 'approved' ? <ShieldCheck size={20} color="#00A56A" /> : null}
            </View>

            {profileAge ? (
              <View className="mt-2 flex-row items-center gap-2">
                <View className={`h-px w-4 ${isDark ? 'bg-[#B08D57]/40' : 'bg-[#A9793F]/30'}`} />
                <Text className={`text-[11px] font-semibold uppercase tracking-[3px] ${isDark ? 'text-[#D9B77E]' : 'text-[#A9793F]'}`}>{profileAge} Years Old</Text>
                <View className={`h-px w-4 ${isDark ? 'bg-[#B08D57]/40' : 'bg-[#A9793F]/30'}`} />
              </View>
            ) : null}

            {location ? <Text className={`mt-2 text-[18px] ${textSecondary}`}>{location}</Text> : null}

            <View className="mt-3">
              <StarRow rating={stats?.avg_rating ?? 0} size={18} />
            </View>

            <Text className={`mt-1 text-[16px] ${textSecondary}`}>
              {stats?.rating_count && stats.avg_rating != null
                ? `${stats.avg_rating.toFixed(1)} rating (${stats.rating_count} ${stats.rating_count === 1 ? 'review' : 'reviews'})`
                : 'No ratings yet'}
            </Text>

            {profile?.bio?.trim() ? (
              <Text className={`mt-6 self-stretch text-[17px] leading-7 ${textPrimary}`}>{profile.bio.trim()}</Text>
            ) : (
              <Text className={`mt-6 text-[16px] italic ${textSecondary}`}>No bio yet.</Text>
            )}

            <View className="mt-6 w-full border-t border-[#E8ECF3] pt-6">
              <Text className={`text-headline-18 font-bold ${textPrimary}`}>Travel Experience</Text>

              <View className="mt-4 gap-4">
                {[
                  ['Trips Completed', String(stats?.trips_completed ?? 0)],
                  ['Places Visited', String(stats?.places_visited ?? 0)],
                  ['Carpools', String(stats?.carpools_completed ?? 0)],
                  ['Tours', String(stats?.tours_completed ?? 0)],
                ].map(([label, value]) => (
                  <View key={label} className="flex-row items-center justify-between">
                    <Text className={`text-[18px] ${textSecondary}`}>{label}</Text>
                    <Text className={`text-[18px] font-extrabold ${textPrimary}`}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="mt-6 w-full border-t border-[#E8ECF3] pt-6">
              <Text className={`text-headline-18 font-bold ${textPrimary}`}>Interests</Text>
              <View className="mt-4 flex-row flex-wrap gap-2.5">
                {profile?.interests?.length ? profile.interests.map((interest) => (
                  <View key={interest} className={`rounded-full px-4 py-2 ${softFill}`}>
                    <Text className={`text-[15px] ${textSecondary}`}>{interest}</Text>
                  </View>
                )) : <Text className={`text-[15px] ${textSecondary}`}>No interests selected yet.</Text>}
              </View>
            </View>
          </View>
        </SectionCard>

        {(() => {
          const status =
            verification?.status === 'pending' || verification?.status === 'resubmitted'
              ? 'pending'
              : profile?.verification_status ?? 'unverified';
          const styles = {
            approved: { border: isDark ? 'border-[#1F3B3D] bg-[#0F1F24]' : 'border-[#BEEFCB] bg-[#EFFCF3]', icon: <CheckCircle2 size={24} color="#00A56A" />, label: 'Verified', labelColor: '#00A56A' },
            pending: { border: isDark ? 'border-[#3B341F] bg-[#241F0F]' : 'border-[#F3E3B5] bg-[#FFF8E6]', icon: <Clock size={24} color="#D88700" />, label: 'Pending Review', labelColor: '#D88700' },
            rejected: { border: isDark ? 'border-[#3B1F1F] bg-[#240F0F]' : 'border-[#F3C7C7] bg-[#FFF0F0]', icon: <ShieldAlert size={24} color="#DC2626" />, label: 'Rejected', labelColor: '#DC2626' },
            unverified: { border: isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E9EDF5] bg-white', icon: <Shield size={24} color="#6B7590" />, label: 'Not Verified', labelColor: '#6B7590' },
          }[status];

          return (
            <View className={`rounded-[22px] border p-4 ${styles.border}`}>
              <View className="flex-row items-start gap-3">
                {styles.icon}
                <View className="flex-1">
                  <Text className={`text-headline-18 font-bold ${textPrimary}`}>ID Verification</Text>
                  <Text className="text-[18px]" style={{ color: styles.labelColor }}>{styles.label}</Text>

                  {status === 'approved' && (
                    <View className={`mt-3 rounded-xl px-4 py-4 ${isDark ? 'bg-[#153224]' : 'bg-[#D9F8E4]'}`}>
                      <Text className={`text-[17px] leading-6 ${isDark ? 'text-[#A7F3D0]' : 'text-[#0F7B4B]'}`}>
                        ✓ Your identity is verified. You can now create and join trips!
                      </Text>
                    </View>
                  )}

                  {status === 'pending' && (
                    <Text className={`mt-2 text-[15px] leading-5 ${textSecondary}`}>Your documents are under review. This usually takes 1-2 hours.</Text>
                  )}

                  {status === 'rejected' && verification?.reviewer_notes && (
                    <Text className="mt-2 text-[15px] leading-5 text-[#DC2626]">Reason: {verification.reviewer_notes}</Text>
                  )}

                  {(status === 'unverified' || status === 'rejected') && (
                    <TouchableOpacity onPress={() => router.push('/verify-id')} className="mt-3 self-start rounded-full bg-[#2747C7] px-5 py-3">
                      <Text className="text-[15px] font-bold text-white">{status === 'rejected' ? 'Resubmit Documents' : 'Verify Now'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })()}

        <SectionCard>
          <View className="flex-row items-center gap-2">
            <Shield size={22} color="#00A56A" />
            <Text className={`text-headline-18 font-bold ${textPrimary}`}>Email Verification</Text>
          </View>

          <View className="mt-4 gap-3">
            <View className={`flex-row items-center justify-between rounded-2xl px-4 py-4 ${isDark ? 'bg-[#18253C]' : 'bg-[#F4F8F6]'}`}>
              <Text className={`text-[17px] ${textPrimary}`}>Email</Text>
              {emailVerified ? (
                <Text className="text-[16px] font-semibold text-[#00A56A]">✓ Verified</Text>
              ) : (
                <Text className={`text-[15px] ${textSecondary}`}>Not verified</Text>
              )}
            </View>
          </View>
        </SectionCard>

        <SectionCard>
          <View className="flex-row items-center gap-2">
            <Users size={22} color="#2647B8" />
            <Text className={`text-headline-18 font-bold ${textPrimary}`}>Trusted Circle</Text>
          </View>

          <TouchableOpacity onPress={() => router.push('/friends')} className={`mt-4 flex-row items-center justify-center gap-2 rounded-2xl border py-3.5 ${isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#D7DDE8] bg-white'}`}>
            <Users size={18} color="#2647B8" />
            <Text className={`text-[17px] font-medium ${textPrimary}`}>View Friends</Text>
          </TouchableOpacity>

          <View className="mt-4 gap-3">
            {confirmedTrustedContacts.length ? (
              confirmedTrustedContacts.slice(0, 3).map((contact) => (
                <View key={contact.id} className={`rounded-2xl px-4 py-4 ${isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F7]'}`}>
                  <Text className={`text-[18px] ${textPrimary}`}>{contact.display_name}</Text>
                  <Text className={`mt-1 text-[15px] ${textSecondary}`}>{contact.relationship}</Text>
                </View>
              ))
            ) : (
              <Text className={`text-[16px] ${textSecondary}`}>No confirmed emergency contacts yet.</Text>
            )}
          </View>

          <TouchableOpacity onPress={() => router.push('/trusted-circle')} className={`mt-4 rounded-2xl border py-3.5 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#D7DDE8] bg-white'}`}>
            <Text className={`text-center text-[17px] ${textPrimary}`}>{confirmedTrustedContacts.length ? 'Manage Emergency Contacts' : 'Add Emergency Contact'}</Text>
          </TouchableOpacity>
        </SectionCard>

        <SectionCard>
            <Text className={`text-headline-18 font-bold ${textPrimary}`}>Recent Reviews</Text>

          <View className="mt-4 gap-4">
            {reviews.length ? (
              reviews.map((review, index) => (
                <View key={review.id} className={`${index > 0 ? 'border-t border-[#E8ECF3] pt-4' : ''}`}>
                  <View className="flex-row items-center justify-between">
                    <Text className={`text-[18px] ${textPrimary}`}>{review.author_name}</Text>
                    <Text className={`text-[15px] ${textSecondary}`}>{formatRelativeDate(review.created_at)}</Text>
                  </View>
                  <View className="mt-2">
                    <StarRow rating={review.rating} size={15} />
                  </View>
                  {review.comment ? <Text className={`mt-2 text-[17px] leading-6 ${textSecondary}`}>{review.comment}</Text> : null}
                </View>
              ))
            ) : (
              <Text className={`text-[16px] ${textSecondary}`}>No reviews yet. Travelers can rate you after a completed trip.</Text>
            )}
          </View>
        </SectionCard>

        <SectionCard>
          <View className="flex-row items-center gap-2">
            <AlertCircle size={22} color="#E32727" />
            <Text className={`text-headline-18 font-bold ${textPrimary}`}>Emergency Settings</Text>
          </View>
          <Text className={`mt-4 text-[17px] leading-6 ${textSecondary}`}>
            When you activate SOS, your location will be shared with your trusted circle and our safety team.
          </Text>
          <TouchableOpacity onPress={() => router.push('/trusted-circle')} className="mt-4 rounded-2xl bg-[#E32727] py-4">
            <Text className="text-center text-[17px] font-bold text-white">Manage Emergency Contacts</Text>
          </TouchableOpacity>
        </SectionCard>

        <TouchableOpacity onPress={() => router.push('/vehicles')} className={`flex-row items-center justify-center gap-2 rounded-2xl border py-4 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#2647B8] bg-white'}`}>
          <Car size={20} color="#2647B8" />
          <Text className={`text-[17px] font-medium ${isDark ? 'text-[#E2E8F0]' : 'text-[#2647B8]'}`}>My Vehicles</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={signOut} className={`flex-row items-center justify-center gap-2 rounded-2xl border py-4 ${isDark ? 'border-[#7A2D2D] bg-[#111827]' : 'border-[#FF4D4D] bg-white'}`}>
          <LogOut size={20} color="#E32727" />
          <Text className={`text-[17px] font-medium ${isDark ? 'text-[#E2E8F0]' : 'text-[#E32727]'}`}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
