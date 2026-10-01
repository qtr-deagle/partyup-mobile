import { parseTimestamp } from '@/lib/datetime';
import { supabase } from '@/lib/supabase';

const REQUEST_TIMEOUT_MS = 10000;

export async function withRequestTimeout<T>(request: PromiseLike<T>, label: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out. Check your connection and try again.`)), REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export type SearchProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  interests: string[];
  bio: string | null;
  date_of_birth: string | null;
  verification_status: string | null;
  city: string | null;
  country: string | null;
  trust_score: number | null;
  trust_count: number;
  updated_at: string;
  // Has at least one approved vehicle; only returned by search_profiles.
  has_vehicle?: boolean;
  request_status: 'incoming_pending' | 'outgoing_pending' | 'accepted' | null;
  request_id: string | null;
  is_blocked_by_me?: boolean;
  has_blocked_me?: boolean;
};

export type IncomingFriendRequest = {
  id: string;
  requester_id: string;
  display_name: string;
  created_at: string;
};

export type FriendConnection = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  interests: string[];
  request_id: string;
  relationship_status: 'accepted' | 'incoming_pending' | 'outgoing_pending';
  created_at: string;
};

export type Conversation = {
  thread_id: string;
  other_user_id: string;
  display_name: string;
  avatar_url: string | null;
  interests: string[];
  last_message: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  last_message_type: ChatMessage['message_type'] | null;
  last_message_deleted: boolean;
  other_last_read_at: string | null;
  other_last_delivered_at: string | null;
  unread_count: number;
  muted: boolean;
  pinned: boolean;
  // Set after "Delete chat": messages before it stay hidden for me.
  cleared_at: string | null;
};

// Where one of my messages is on its way to the other person.
export type MessageStatus = 'sending' | 'failed' | 'sent' | 'delivered' | 'seen';

export type ThreadReceipts = { readAt: string | null; deliveredAt: string | null };

export type ChatMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  message_type: 'text' | 'system' | 'location' | 'image';
  created_at: string;
  // Set when a message was unsent or removed (body is then empty).
  deleted_at?: string | null;
  // Who removed it: the sender (unsend) or a guild moderator.
  deleted_by?: string | null;
  // Photo messages: a path in the private chat-media bucket.
  image_path?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  reply_to_id?: string | null;
};

export const REACTION_EMOJIS = ['❤️', '😆', '😮', '😢', '😡', '👍'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export type ChatReaction = { message_id: string; user_id: string; emoji: ReactionEmoji };

const MESSAGE_COLUMNS = 'id, thread_id, sender_id, body, message_type, created_at, deleted_at, deleted_by, image_path, image_width, image_height, reply_to_id';

export async function searchProfiles(query: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('search_profiles', { p_query: query }), 'Searching people');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to search people.') };
  }
  const { data, error } = response;
  if (error) {
    return { data: [], error };
  }

  const profiles = (data ?? []) as SearchProfile[];
  const statuses = await getFriendRequestStatuses(profiles.map((profile) => profile.id));
  return {
    data: profiles.map((profile) => ({
      ...profile,
      request_status: statuses.get(profile.id)?.status ?? profile.request_status ?? null,
      request_id: statuses.get(profile.id)?.requestId ?? profile.request_id ?? null,
    })),
    error: null,
  };
}

export async function getProfileById(id: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('get_profile_by_id', { p_user_id: id }), 'Loading profile');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to load profile.') };
  }
  const { data, error } = response;
  if (error) {
    return { data: null, error };
  }
  const rows = (data ?? []) as SearchProfile[];
  const profile = rows[0];
  return { data: profile ? { ...profile, request_status: null, request_id: null } : null, error: null };
}

export async function getFriendRequestStatuses(profileIds: string[]) {
  const statuses = new Map<string, { status: SearchProfile['request_status']; requestId: string }>();
  if (!profileIds.length) {
    return statuses;
  }

  let sessionResult;
  try {
    sessionResult = (await withRequestTimeout(supabase.auth.getSession(), 'Loading your session')).data;
  } catch {
    return statuses;
  }
  const userId = sessionResult.session?.user.id;
  if (!userId) {
    return statuses;
  }

  let requestResult;
  try {
    requestResult = await withRequestTimeout(supabase
      .from('friend_requests')
      .select('id, requester_id, recipient_id, status, updated_at')
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
      .in('status', ['pending', 'accepted'])
      .order('updated_at', { ascending: false }), 'Loading friend requests');
  } catch {
    return statuses;
  }
  const { data } = requestResult;

  for (const request of data ?? []) {
    const otherUserId = request.requester_id === userId ? request.recipient_id : request.requester_id;
    if (!profileIds.includes(otherUserId) || statuses.has(otherUserId)) {
      continue;
    }
    statuses.set(otherUserId, {
      status: request.status === 'accepted' ? 'accepted' : request.requester_id === userId ? 'outgoing_pending' : 'incoming_pending',
      requestId: request.id,
    });
  }

  return statuses;
}

export async function sendFriendRequest(recipientId: string) {
  return withRequestTimeout(supabase.rpc('send_friend_request', { p_recipient_id: recipientId }), 'Sending friend request');
}

export async function removeFriend(otherUserId: string) {
  return withRequestTimeout(supabase.rpc('remove_friend', { p_other_user_id: otherUserId }), 'Removing friend');
}

export async function listFriendConnections() {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_friend_connections'), 'Loading friends');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load friends.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as FriendConnection[], error };
}

export async function listIncomingFriendRequests() {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_incoming_friend_requests'), 'Loading notifications');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load notifications.') };
  }
  const { data, error } = response;
  if (!error) {
    return { data: (data ?? []) as IncomingFriendRequest[], error: null };
  }

  const { data: sessionResult } = await supabase.auth.getSession();
  const userId = sessionResult.session?.user.id;
  if (!userId) {
    return { data: [], error };
  }

  const { data: requests } = await supabase
    .from('friend_requests')
    .select('id, requester_id, created_at')
    .eq('recipient_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  const profiles = await searchProfiles('');
  const names = new Map(profiles.data.map((profile) => [profile.id, profile.display_name]));

  return {
    data: (requests ?? []).map((request) => ({
      ...request,
      display_name: names.get(request.requester_id) ?? 'A PartyUp traveler',
    })) as IncomingFriendRequest[],
    error: null,
  };
}

export async function respondToFriendRequest(requestId: string, status: 'accepted' | 'rejected' | 'cancelled') {
  return withRequestTimeout(supabase.rpc('respond_to_friend_request', { p_request_id: requestId, p_status: status }), 'Updating friend request');
}

export async function createOrGetDirectThread(otherUserId: string) {
  return withRequestTimeout(supabase.rpc('create_or_get_direct_thread', { p_other_user_id: otherUserId }), 'Opening conversation');
}

export async function ensureAcceptedDirectThreads() {
  const { data: sessionResult } = await supabase.auth.getSession();
  const userId = sessionResult.session?.user.id;
  if (!userId) {
    return { error: new Error('You are not signed in.') };
  }

  const { data: requests, error } = await supabase
    .from('friend_requests')
    .select('requester_id, recipient_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);
  if (error) {
    return { error };
  }

  for (const request of requests ?? []) {
    const otherUserId = request.requester_id === userId ? request.recipient_id : request.requester_id;
    const result = await createOrGetDirectThread(otherUserId);
    if (result.error) {
      return { error: result.error };
    }
  }

  return { error: null };
}

export async function listDirectConversations() {
  const { data, error } = await withRequestTimeout(supabase.rpc('list_direct_conversations'), 'Loading conversations');
  return { data: (data ?? []) as Conversation[], error };
}

// `since` hides messages from before a "Delete chat".
export async function getChatMessages(threadId: string, since?: string | null) {
  let query = supabase.from('chat_messages').select(MESSAGE_COLUMNS).eq('thread_id', threadId);
  if (since) query = query.gt('created_at', since);
  const { data, error } = await withRequestTimeout(query.order('created_at', { ascending: true }), 'Loading messages');
  return { data: (data ?? []) as ChatMessage[], error };
}

export type OutgoingPhoto = { path: string; width: number; height: number };

export async function sendChatMessage(threadId: string, senderId: string, body: string, options: { replyToId?: string | null; photo?: OutgoingPhoto } = {}) {
  const { photo, replyToId } = options;
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: threadId,
      sender_id: senderId,
      body,
      message_type: photo ? 'image' : 'text',
      image_path: photo?.path ?? null,
      image_width: photo?.width ?? null,
      image_height: photo?.height ?? null,
      reply_to_id: replyToId ?? null,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  return { data: data as ChatMessage | null, error };
}

export async function unsendMessage(messageId: string) {
  return supabase.rpc('unsend_chat_message', { p_message_id: messageId });
}

export async function getReactions(threadId: string) {
  const { data, error } = await supabase.from('chat_message_reactions').select('message_id, user_id, emoji').eq('thread_id', threadId);
  return { data: (data ?? []) as ChatReaction[], error };
}

// `null` removes my reaction. thread_id is filled in by the database.
export async function setReaction(messageId: string, userId: string, emoji: ReactionEmoji | null) {
  if (!emoji) {
    return supabase.from('chat_message_reactions').delete().eq('message_id', messageId).eq('user_id', userId);
  }
  return supabase.from('chat_message_reactions').upsert({ message_id: messageId, user_id: userId, emoji }, { onConflict: 'message_id,user_id' });
}

export async function setChatMuted(threadId: string, muted: boolean) {
  return supabase.rpc('set_chat_muted', { p_thread_id: threadId, p_muted: muted });
}

export async function setChatPinned(threadId: string, pinned: boolean) {
  return supabase.rpc('set_chat_pinned', { p_thread_id: threadId, p_pinned: pinned });
}

// A carpool or tour group chat, for the Messages list.
export type GroupConversation = {
  thread_id: string;
  trip_id: string;
  title: string;
  trip_type: 'carpool' | 'tour';
  trip_status: string;
  member_count: number;
  last_message: string | null;
  last_message_type: ChatMessage['message_type'] | null;
  last_message_deleted: boolean;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  last_sender_name: string | null;
  unread_count: number;
  muted: boolean;
  pinned: boolean;
};

export async function listGroupConversations() {
  const { data, error } = await withRequestTimeout(supabase.rpc('list_group_conversations'), 'Loading group chats');
  return { data: (data ?? []) as GroupConversation[], error };
}

export async function getTripChatThread(tripId: string) {
  const { data, error } = await withRequestTimeout(supabase.rpc('get_trip_chat_thread', { p_trip_id: tripId }), 'Opening trip chat');
  return { data: (data ?? null) as string | null, error };
}

// My own mute/pin settings for a thread.
export async function getChatPrefs(threadId: string, userId: string) {
  const { data, error } = await supabase.from('chat_participants').select('muted, pinned_at').eq('thread_id', threadId).eq('user_id', userId).maybeSingle();
  return { data: { muted: Boolean(data?.muted), pinned: Boolean(data?.pinned_at) }, error };
}

export async function clearChatForMe(threadId: string) {
  return supabase.rpc('clear_chat_for_me', { p_thread_id: threadId });
}

export async function markThreadRead(threadId: string) {
  return supabase.rpc('mark_thread_read', { p_thread_id: threadId });
}

export async function markThreadsDelivered() {
  return supabase.rpc('mark_threads_delivered');
}

export async function countUnreadMessages() {
  const { data, error } = await supabase.rpc('count_unread_messages');
  return { count: Number(data ?? 0), error };
}

// The other person's read/delivered marks for a direct thread.
export async function getThreadReceipts(threadId: string, otherUserId: string) {
  const { data, error } = await supabase
    .from('chat_participants')
    .select('last_read_at, last_delivered_at')
    .eq('thread_id', threadId)
    .eq('user_id', otherUserId)
    .maybeSingle();
  return { data: { readAt: data?.last_read_at ?? null, deliveredAt: data?.last_delivered_at ?? null } as ThreadReceipts, error };
}

export function messageStatus(createdAt: string, receipts: ThreadReceipts): MessageStatus {
  const sentAt = parseTimestamp(createdAt).getTime();
  if (receipts.readAt && parseTimestamp(receipts.readAt).getTime() >= sentAt) return 'seen';
  if (receipts.deliveredAt && parseTimestamp(receipts.deliveredAt).getTime() >= sentAt) return 'delivered';
  return 'sent';
}
