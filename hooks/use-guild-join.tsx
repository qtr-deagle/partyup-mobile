import { SuccessOverlay } from '@/components/ui/motion';
import { cancelJoinRequest, getMyJoinRequest, joinGuild, type GuildEmblem, type JoinPolicy, type MyJoinRequest } from '@/lib/guilds';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

// What the join flow needs to know about a guild (a leaderboard row or a
// full Guild Hall both fit).
export type JoinableGuild = {
  guild_id: string;
  name: string;
  emblem: GuildEmblem;
  color: string;
  leader_name: string;
  join_policy: JoinPolicy;
};

// Join / request / cancel for a traveler without a guild, shared by the
// Leaderboard and the Guild Hall so both behave the same. Render `overlay`
// once in the screen for the "Request sent" moment.
export function useGuildJoin({ onJoined, onRequested }: { onJoined: () => void; onRequested?: () => void }) {
  const [myRequest, setMyRequest] = useState<MyJoinRequest | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [requestSentTo, setRequestSentTo] = useState<string | null>(null);
  const clearRequestSent = useCallback(() => setRequestSentTo(null), []);

  const refreshMyRequest = useCallback(async () => {
    const { data } = await getMyJoinRequest();
    setMyRequest(data);
  }, []);

  function requestJoin(guild: JoinableGuild) {
    const needsApproval = guild.join_policy === 'approval';
    const replacing = myRequest && myRequest.guild_id !== guild.guild_id ? ` This replaces your pending request to ${myRequest.guild_name}.` : '';
    Alert.alert(
      needsApproval ? `Ask to join ${guild.name}?` : `Join ${guild.name}?`,
      needsApproval
        ? `${guild.leader_name} reviews requests for this guild. You'll get +10 pts once you're accepted.${replacing}`
        : `You'll earn points together with ${guild.leader_name}'s guild (+10 for joining). You can only be in one guild at a time.${replacing}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: needsApproval ? 'Send request' : 'Join',
          onPress: async () => {
            setJoiningId(guild.guild_id);
            const { data, error } = await joinGuild(guild.guild_id);
            setJoiningId(null);
            if (error) {
              Alert.alert(needsApproval ? 'Could not send request' : 'Could not join', error.message);
              return;
            }
            if (data === 'requested') {
              setMyRequest({
                id: '',
                guild_id: guild.guild_id,
                guild_name: guild.name,
                guild_emblem: guild.emblem,
                guild_color: guild.color,
                created_at: new Date().toISOString(),
              });
              setRequestSentTo(guild.leader_name);
              onRequested?.();
              return;
            }
            onJoined();
          },
        },
      ]
    );
  }

  function cancelRequest() {
    if (!myRequest) return;
    Alert.alert(`Cancel your request to ${myRequest.guild_name}?`, 'You can ask again or pick another guild any time.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setJoiningId('cancel');
          const { error } = await cancelJoinRequest();
          setJoiningId(null);
          if (error) {
            Alert.alert('Could not cancel', error.message);
            return;
          }
          setMyRequest(null);
        },
      },
    ]);
  }

  const overlay = (
    <SuccessOverlay
      visible={requestSentTo !== null}
      title="Request sent"
      message={`${requestSentTo ?? 'The leader'} will review it. We'll notify you when they answer.`}
      onDone={clearRequestSent}
    />
  );

  return { myRequest, setMyRequest, refreshMyRequest, joiningId, requestJoin, cancelRequest, overlay };
}
