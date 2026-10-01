import { GroupChatView } from '@/components/chat/GroupChatView';
import { EmptyState } from '@/components/ui/motion';
import { listBlockedUsers } from '@/lib/blocking';
import { getTripDetail, listTripMembers, type TripDetail, type TripMember } from '@/lib/carpool';
import { getTripChatThread } from '@/lib/social';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Car, Lock, Map as MapIcon, MessageCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

const CARPOOL_COLOR = '#2A55D4';
const TOUR_COLOR = '#0E9F6E';

// Group chat for a carpool or tour. The database adds accepted members and
// removes anyone who leaves, so this screen only has to find the thread.
export default function TripChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notMember, setNotMember] = useState(false);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const [detail, memberResult, thread, blocked] = await Promise.all([getTripDetail(id), listTripMembers(id), getTripChatThread(id), listBlockedUsers()]);
      if (cancelled) return;
      setTrip(detail.data);
      setMembers(memberResult.data.filter((member) => member.status === 'accepted'));
      setBlockedIds(new Set(blocked.data.map((row) => row.blocked_id)));
      if (thread.error || !thread.data) setNotMember(true);
      else setThreadId(thread.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const isTour = trip?.trip_type === 'tour';
  const color = isTour ? TOUR_COLOR : CARPOOL_COLOR;
  const Icon = isTour ? MapIcon : Car;
  const openTrip = () => router.push({ pathname: '/trip/[id]', params: { id } });

  return (
    <GroupChatView
      threadId={threadId}
      loading={loading}
      blocker={notMember ? <EmptyState icon={<Lock size={34} color={color} />} title="Members only" message="Join this trip to chat with the group." /> : undefined}
      title={trip?.title ?? 'Trip chat'}
      subtitle={`${isTour ? 'Tour' : 'Carpool'} chat · ${members.length} ${members.length === 1 ? 'member' : 'members'}`}
      avatar={
        <View className="items-center justify-center rounded-full bg-white" style={{ width: 38, height: 38 }}>
          <Icon size={20} color={color} />
        </View>
      }
      color={color}
      onPressTitle={openTrip}
      members={members.map((member) => ({
        userId: member.user_id,
        name: member.display_name,
        avatarUrl: member.avatar_url,
        label: member.member_role === 'driver' ? (isTour ? 'Organizer' : 'Driver') : member.member_role === 'coordinator' ? 'Organizer' : undefined,
      }))}
      blockedIds={blockedIds}
      placeholder="Message the group"
      empty={{
        icon: <MessageCircle size={34} color={color} />,
        title: 'Say hi to your group',
        message: isTour ? 'Coordinate the itinerary, meetup time and what to bring.' : 'Sort out the pickup point, timing and payments here.',
      }}
      pinnable
      infoLink={{ label: isTour ? 'View tour details' : 'View trip details', onPress: openTrip }}
    />
  );
}
