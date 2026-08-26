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
  request_status: 'incoming_pending' | 'outgoing_pending' | 'accepted' | null;
  request_id: string | null;
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
  unread_count: number;
};

export type ChatMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  message_type: 'text' | 'system' | 'location';
  created_at: string;
};

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

export async function getChatMessages(threadId: string) {
  const { data, error } = await withRequestTimeout(supabase
    .from('chat_messages')
    .select('id, thread_id, sender_id, body, message_type, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true }), 'Loading messages');
  return { data: (data ?? []) as ChatMessage[], error };
}

export async function sendChatMessage(threadId: string, senderId: string, body: string) {
  return supabase.from('chat_messages').insert({
    thread_id: threadId,
    sender_id: senderId,
    body,
    message_type: 'text',
  });
}

export async function markThreadRead(threadId: string) {
  return supabase.rpc('mark_thread_read', { p_thread_id: threadId });
}
