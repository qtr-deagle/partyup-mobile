import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { getTheme, typography } from '@/lib/theme';
import { listTrustedContacts, type TrustedContact } from '@/lib/trustedCircle';
import { getMyVerification, type IdVerification } from '@/lib/verification';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertCircle, Car, CheckCircle2, Clock, Cog, LogOut, Shield, ShieldAlert, ShieldCheck, Star, Users, Wallet } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

const reviews = [
  {
    id: 1,
    author: 'Sarah',
    date: '2 weeks ago',
    rating: 5,
    text: 'Amazing travel buddy! Very responsible and fun to be around.',
  },
  {
    id: 2,
    author: 'Mike',
    date: '1 month ago',
    rating: 5,
    text: 'Great communication and very reliable. Highly recommended!',
  },
  {
    id: 3,
    author: 'Emma',
    date: '2 months ago',
    rating: 4,
    text: 'Good company and flexible with plans. Would travel again!',
  },
];

function SectionCard({ children }: { children: React.ReactNode }) {
  const isDark = useColorScheme() === 'dark';
  return <View className={`rounded-[22px] border p-4 shadow-sm ${isDark ? 'border-[#22324B] bg-[#111B2E] shadow-black/20' : 'border-[#E9EDF5] bg-white shadow-black/5'}`}>{children}</View>;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session, refreshProfile, signOut } = useAuth();
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [verification, setVerification] = useState<IdVerification | null>(null);
  const [editingPayment, setEditingPayment] = useState(false);
  const [gcashInput, setGcashInput] = useState('');
  const [paymayaInput, setPaymayaInput] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const isDark = useColorScheme() === 'dark';
  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F7F8FC]';
  const headerBackground = isDark ? 'border-[#1E293B] bg-[#0F172A]' : 'border-[#E5EAF2] bg-white';
  const { titleColor } = getTheme(isDark);
  const textPrimary = isDark ? 'text-white' : 'text-[#182847]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const softFill = isDark ? 'bg-[#18253C]' : 'bg-[#F2F4F8]';
  const profileAge = profile?.date_of_birth ? Math.max(0, new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear() - (new Date() < new Date(new Date().getFullYear(), new Date(profile.date_of_birth).getMonth(), new Date(profile.date_of_birth).getDate()) ? 1 : 0)) : null;
  const confirmedTrustedContacts = trustedContacts.filter((contact) => contact.status === 'accepted');

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
    }, [refreshProfile])
  );

  function startEditingPayment() {
    setGcashInput(profile?.gcash_handle ?? '');
    setPaymayaInput(profile?.paymaya_handle ?? '');
    setEditingPayment(true);
  }

  async function handleSavePayment() {
    if (!session?.user.id) {
      return;
    }
    setSavingPayment(true);
    const { error } = await supabase
      .from('profiles')
      .update({ gcash_handle: gcashInput.trim() || null, paymaya_handle: paymayaInput.trim() || null })
      .eq('id', session.user.id);
    setSavingPayment(false);
    if (!error) {
      await refreshProfile();
      setEditingPayment(false);
    }
  }

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-28">
      <View className={`border-b px-4 py-4 ${headerBackground}`}>
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.push('/modal')} className="h-10 w-10 items-center justify-center rounded-full">
            <Cog size={22} color={isDark ? '#E2E8F0' : '#2647B8'} />
          </TouchableOpacity>
          <Text className={`${typography.pageTitle} ${titleColor}`}>{profile?.display_name ?? 'Alex'}</Text>
          <View className="h-10 w-10" />
        </View>
      </View>

      <View className="px-4 pt-4 gap-5">
        <SectionCard>
          <View className="items-center">
            <View className={`h-28 w-28 rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#D5E4EE]'}`} />

            <View className="mt-6 flex-row items-center gap-2">
              <Text className={`text-[30px] font-black ${textPrimary}`}>{profile?.display_name ?? 'Alex'}</Text>
              <ShieldCheck size={20} color="#00A56A" />
            </View>

            {profileAge ? (
              <View className="mt-2 flex-row items-center gap-2">
                <View className={`h-px w-4 ${isDark ? 'bg-[#B08D57]/40' : 'bg-[#A9793F]/30'}`} />
                <Text className={`text-[11px] font-semibold uppercase tracking-[3px] ${isDark ? 'text-[#D9B77E]' : 'text-[#A9793F]'}`}>{profileAge} Years Old</Text>
                <View className={`h-px w-4 ${isDark ? 'bg-[#B08D57]/40' : 'bg-[#A9793F]/30'}`} />
              </View>
            ) : null}

            <Text className={`mt-2 text-[18px] ${textSecondary}`}>{profile?.city && profile?.country ? `${profile.city}, ${profile.country}` : 'San Francisco, CA'}</Text>

            <View className="mt-3 flex-row items-center gap-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} size={18} color="#F4B400" fill="#F4B400" />
              ))}
            </View>

            <Text className={`mt-1 text-[16px] ${textSecondary}`}>4.9 rating (12 reviews)</Text>

            <Text className={`mt-6 text-[17px] leading-7 ${textPrimary}`}>
              Adventure seeker and travel enthusiast! Love exploring new cultures, trying local food, and making new friends. Always up for hiking, museums, and spontaneous adventures.
            </Text>

            <View className="mt-6 w-full border-t border-[#E8ECF3] pt-6">
              <Text className={`text-[18px] font-black ${textPrimary}`}>Travel Experience</Text>

              <View className="mt-4 gap-4">
                {[
                  ['Countries Visited', '12'],
                  ['Solo Trips', '8'],
                  ['Group Trips', '4'],
                ].map(([label, value]) => (
                  <View key={label} className="flex-row items-center justify-between">
                    <Text className={`text-[18px] ${textSecondary}`}>{label}</Text>
                    <Text className={`text-[18px] font-extrabold ${textPrimary}`}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="mt-6 w-full border-t border-[#E8ECF3] pt-6">
              <Text className={`text-[18px] font-black ${textPrimary}`}>Interests</Text>
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
                  <Text className={`text-[18px] font-black ${textPrimary}`}>ID Verification</Text>
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
            <Text className={`text-[22px] font-black ${textPrimary}`}>Other Verifications</Text>
          </View>

          <View className="mt-4 gap-3">
            {['Email Verified', 'Phone Verified'].map((item) => (
              <View key={item} className={`flex-row items-center justify-between rounded-2xl px-4 py-4 ${isDark ? 'bg-[#18253C]' : 'bg-[#F4F8F6]'}`}>
                <Text className={`text-[17px] ${textPrimary}`}>{item}</Text>
                <Text className="text-[20px] text-[#00A56A]">✓</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard>
          <View className="flex-row items-center gap-2">
            <Users size={22} color="#2647B8" />
            <Text className={`text-[22px] font-black ${textPrimary}`}>Trusted Circle</Text>
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
            <Text className={`text-[22px] font-black ${textPrimary}`}>Recent Reviews</Text>

          <View className="mt-4 gap-4">
            {reviews.map((review, index) => (
              <View key={review.id} className={`${index > 0 ? 'border-t border-[#E8ECF3] pt-4' : ''}`}>
                <View className="flex-row items-center justify-between">
                  <Text className={`text-[18px] ${textPrimary}`}>{review.author}</Text>
                  <Text className={`text-[15px] ${textSecondary}`}>{review.date}</Text>
                </View>
                <View className="mt-2 flex-row items-center gap-1">
                  {Array.from({ length: review.rating }).map((_, starIndex) => (
                    <Star key={starIndex} size={15} color="#F4B400" fill="#F4B400" />
                  ))}
                </View>
                <Text className={`mt-2 text-[17px] leading-6 ${textSecondary}`}>{review.text}</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard>
          <View className="flex-row items-center gap-2">
            <AlertCircle size={22} color="#E32727" />
            <Text className={`text-[22px] font-black ${textPrimary}`}>Emergency Settings</Text>
          </View>
          <Text className={`mt-4 text-[17px] leading-6 ${textSecondary}`}>
            When you activate SOS, your location will be shared with your trusted circle and our safety team.
          </Text>
          <TouchableOpacity onPress={() => router.push('/trusted-circle')} className="mt-4 rounded-2xl bg-[#E32727] py-4">
            <Text className="text-center text-[17px] font-bold text-white">Manage Emergency Contacts</Text>
          </TouchableOpacity>
        </SectionCard>

        <SectionCard>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Wallet size={22} color="#2647B8" />
              <Text className={`text-[22px] font-black ${textPrimary}`}>Payment Methods</Text>
            </View>
            {!editingPayment ? (
              <TouchableOpacity onPress={startEditingPayment}>
                <Text className="text-[16px] font-bold text-[#2647B8]">{profile?.gcash_handle || profile?.paymaya_handle ? 'Edit' : 'Add'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text className={`mt-2 text-[15px] leading-6 ${textSecondary}`}>
            Riders send your carpool fare directly here via GCash or PayMaya — payments never pass through PartyUp.
          </Text>
          {editingPayment ? (
            <View className="mt-4 gap-3">
              <TextInput
                className={`rounded-2xl px-4 py-3.5 text-[16px] ${softFill} ${textPrimary}`}
                placeholder="GCash number"
                placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
                value={gcashInput}
                onChangeText={setGcashInput}
                keyboardType="phone-pad"
              />
              <TextInput
                className={`rounded-2xl px-4 py-3.5 text-[16px] ${softFill} ${textPrimary}`}
                placeholder="PayMaya number"
                placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
                value={paymayaInput}
                onChangeText={setPaymayaInput}
                keyboardType="phone-pad"
              />
              <View className="flex-row gap-2">
                <TouchableOpacity onPress={() => setEditingPayment(false)} className={`flex-1 items-center rounded-2xl border py-3 ${isDark ? 'border-[#22324B]' : 'border-[#D7DDE8]'}`}>
                  <Text className={`font-bold ${textPrimary}`}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSavePayment} disabled={savingPayment} className="flex-1 items-center rounded-2xl bg-[#2647B8] py-3">
                  {savingPayment ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-bold text-white">Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View className="mt-4 gap-2">
              <Text className={`text-[17px] ${textPrimary}`}>GCash: {profile?.gcash_handle || 'Not set'}</Text>
              <Text className={`text-[17px] ${textPrimary}`}>PayMaya: {profile?.paymaya_handle || 'Not set'}</Text>
            </View>
          )}
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
