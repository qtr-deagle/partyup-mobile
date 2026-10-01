import { getChatPhotoUrls, uploadChatPhoto, type PickedPhoto } from '@/lib/chat-media';
import { getChatMessages, getReactions, markThreadRead, sendChatMessage, setReaction, unsendMessage, type ChatMessage, type ChatReaction, type ReactionEmoji } from '@/lib/social';
import { feedback } from '@/lib/sounds';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { useEffect, useMemo, useRef, useState } from 'react';

// A message on screen: `pending` marks one still in flight from this device,
// and `localKey` keeps its React key stable once the server copy replaces it.
// Photos keep the picked file so they show instantly and can be retried.
export type ScreenMessage = ChatMessage & { pending?: 'sending' | 'failed'; localKey?: string; localPhoto?: PickedPhoto };

type Options = {
  threadId: string | null;
  myUserId: string | undefined;
  // Hides messages from before a "Delete chat".
  since?: string | null;
  onIncoming?: (message: ChatMessage) => void;
  onError?: (message: string) => void;
};

// Everything a conversation screen needs about its messages: loading, live
// updates, optimistic sending (text and photos), reactions and unsend.
// Shared by direct, guild and trip chats.
export function useThreadMessages({ threadId, myUserId, since, onIncoming, onError }: Options) {
  const [messages, setMessages] = useState<ScreenMessage[]>([]);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  // Messages present when a chat opens render instantly; only new ones animate in.
  const [initialIds, setInitialIds] = useState<Set<string>>(() => new Set());
  // Callbacks change every render; the realtime subscription reads the latest.
  const callbacks = useRef({ onIncoming, onError });
  useEffect(() => {
    callbacks.current = { onIncoming, onError };
  });

  useEffect(() => {
    if (!threadId || !myUserId) return;
    let active = true;
    const refreshReactions = () =>
      void getReactions(threadId).then((result) => {
        if (active && !result.error) setReactions(result.data);
      });

    void getChatMessages(threadId, since).then((result) => {
      if (!active) return;
      if (result.error) callbacks.current.onError?.(result.error.message);
      else {
        setInitialIds(new Set(result.data.map((message) => message.id)));
        setMessages(result.data);
      }
      setLoaded(true);
      void markThreadRead(threadId);
    });
    refreshReactions();

    const channel = supabase
      .channel(uniqueChannelName(`thread:${threadId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        const incoming = payload.new as ChatMessage;
        setMessages((current) => {
          if (current.some((message) => message.id === incoming.id)) return current;
          // Realtime can beat the insert's own response; swap it in for the optimistic copy.
          const pendingIndex =
            incoming.sender_id === myUserId
              ? current.findIndex(
                  (message) =>
                    message.pending === 'sending' &&
                    message.message_type === incoming.message_type &&
                    (incoming.message_type === 'image' ? message.image_path === incoming.image_path : message.body === incoming.body),
                )
              : -1;
          if (pendingIndex === -1) return [...current, incoming];
          const next = [...current];
          next[pendingIndex] = { ...incoming, localKey: current[pendingIndex].localKey, localPhoto: current[pendingIndex].localPhoto };
          return next;
        });
        if (incoming.sender_id !== myUserId) {
          feedback.received();
          callbacks.current.onIncoming?.(incoming);
        }
        void markThreadRead(threadId);
      })
      // Unsends and moderator removals are soft deletes (an UPDATE).
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        const updated = payload.new as ChatMessage;
        setMessages((current) => current.map((message) => (message.id === updated.id ? { ...message, ...updated } : message)));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_message_reactions', filter: `thread_id=eq.${threadId}` }, refreshReactions)
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
      setMessages([]);
      setReactions([]);
      setLoaded(false);
    };
  }, [threadId, myUserId, since]);

  // Sign any photo paths we don't have a URL for yet.
  useEffect(() => {
    const missing = messages.flatMap((message) => (message.image_path && !photoUrls[message.image_path] ? [message.image_path] : []));
    if (!missing.length) return;
    let active = true;
    void getChatPhotoUrls(missing).then((urls) => {
      if (active && Object.keys(urls).length) setPhotoUrls((current) => ({ ...current, ...urls }));
    });
    return () => {
      active = false;
    };
  }, [messages, photoUrls]);

  // Shows the message immediately as "Sending…", then swaps in the saved row.
  async function deliver(message: ScreenMessage) {
    if (!threadId || !myUserId || !message.localKey) return;
    const localKey = message.localKey;
    const markFailed = () => {
      feedback.error();
      setMessages((current) => current.map((item) => (item.localKey === localKey && item.pending ? { ...item, pending: 'failed' } : item)));
    };

    let photo;
    if (message.localPhoto) {
      // A retry after the upload already worked reuses that file.
      if (message.image_path && message.image_width && message.image_height) {
        photo = { path: message.image_path, width: message.image_width, height: message.image_height };
      } else {
        const upload = await uploadChatPhoto(threadId, message.localPhoto);
        if (upload.error || !upload.data) {
          callbacks.current.onError?.(upload.error?.message ?? 'Failed to send photo.');
          markFailed();
          return;
        }
        const uploaded = upload.data;
        photo = uploaded;
        // Lets the realtime echo find this optimistic copy by its path.
        setMessages((current) => current.map((item) => (item.localKey === localKey ? { ...item, image_path: uploaded.path, image_width: uploaded.width, image_height: uploaded.height } : item)));
      }
    }

    const { data, error } = await sendChatMessage(threadId, myUserId, message.body, { replyToId: message.reply_to_id, photo });
    if (error || !data) {
      markFailed();
      return;
    }
    feedback.sent();
    setMessages((current) => {
      const index = current.findIndex((item) => item.localKey === localKey);
      if (index === -1 || !current[index].pending) return current;
      // Realtime already delivered the saved copy under its own key.
      if (current.some((item) => item.id === data.id)) return current.filter((_, i) => i !== index);
      const next = [...current];
      next[index] = { ...data, localKey, localPhoto: current[index].localPhoto };
      return next;
    });
  }

  function queueMessage(body: string, options: { photo?: PickedPhoto; replyTo?: ScreenMessage | null } = {}) {
    if (!threadId || !myUserId) return;
    const { photo, replyTo } = options;
    const localKey = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message: ScreenMessage = {
      id: localKey,
      localKey,
      thread_id: threadId,
      sender_id: myUserId,
      body,
      message_type: photo ? 'image' : 'text',
      created_at: new Date().toISOString(),
      reply_to_id: replyTo && !replyTo.pending ? replyTo.id : null,
      image_width: photo?.width ?? null,
      image_height: photo?.height ?? null,
      localPhoto: photo,
      pending: 'sending',
    };
    setMessages((current) => [...current, message]);
    void deliver(message);
  }

  function retry(message: ScreenMessage) {
    if (message.pending !== 'failed' || !message.localKey) return;
    const localKey = message.localKey;
    setMessages((current) => current.map((item) => (item.localKey === localKey ? { ...item, pending: 'sending' } : item)));
    void deliver({ ...message, pending: 'sending' });
  }

  function react(message: ScreenMessage, emoji: ReactionEmoji | null) {
    if (!myUserId) return;
    feedback.select();
    setReactions((current) => [...current.filter((item) => !(item.message_id === message.id && item.user_id === myUserId)), ...(emoji ? [{ message_id: message.id, user_id: myUserId, emoji }] : [])]);
    void setReaction(message.id, myUserId, emoji).then(({ error }) => {
      if (!error) return;
      callbacks.current.onError?.(error.message);
      void getReactions(message.thread_id).then((result) => {
        if (!result.error) setReactions(result.data);
      });
    });
  }

  // Marks a message removed right away; `remove` does the server side
  // (unsend for my own, the guild moderation call for someone else's).
  function removeMessage(message: ScreenMessage, remove: (id: string) => PromiseLike<{ error: { message: string } | null }> = unsendMessage) {
    const removedAt = new Date().toISOString();
    setMessages((current) => current.map((item) => (item.id === message.id ? { ...item, body: '', image_path: null, deleted_at: removedAt, deleted_by: myUserId } : item)));
    setReactions((current) => current.filter((item) => item.message_id !== message.id));
    void Promise.resolve(remove(message.id)).then(({ error }) => {
      if (!error) return;
      callbacks.current.onError?.(error.message);
      setMessages((current) => current.map((item) => (item.id === message.id ? message : item)));
    });
  }

  const messagesById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const reactionsByMessage = useMemo(() => {
    const grouped = new Map<string, { emoji: string; count: number }[]>();
    for (const reaction of reactions) {
      const list = grouped.get(reaction.message_id) ?? [];
      const existing = list.find((item) => item.emoji === reaction.emoji);
      if (existing) existing.count += 1;
      else list.push({ emoji: reaction.emoji, count: 1 });
      grouped.set(reaction.message_id, list);
    }
    return grouped;
  }, [reactions]);

  const myReactionFor = (messageId: string) => reactions.find((item) => item.message_id === messageId && item.user_id === myUserId)?.emoji ?? null;
  const photoUriFor = (message: ScreenMessage) => message.localPhoto?.uri ?? (message.image_path ? photoUrls[message.image_path] : undefined);
  const sharedPhotos = messages
    .filter((message) => message.message_type === 'image' && !message.deleted_at && message.image_path && photoUrls[message.image_path])
    .reverse()
    .map((message) => ({ key: message.id, url: photoUrls[message.image_path as string] }));

  return { messages, loaded, initialIds, messagesById, reactionsByMessage, myReactionFor, photoUriFor, sharedPhotos, queueMessage, retry, react, removeMessage };
}
