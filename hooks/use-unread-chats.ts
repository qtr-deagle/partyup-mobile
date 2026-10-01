import { useAuth } from '@/hooks/auth-provider';
import { countUnreadMessages, markThreadsDelivered } from '@/lib/social';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// Total unread direct messages, for the Chat tab badge. While it's mounted it
// also acknowledges incoming messages as "Delivered" so senders' ticks update.
export function useUnreadChats() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => countUnreadMessages().then(({ count, error }) => {
      if (!error) setUnread(count);
    });
    void markThreadsDelivered();
    void refresh();

    const channel = supabase
      .channel(uniqueChannelName(`unread-chats:${userId}`))
      // RLS limits these to threads the user is in.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        if ((payload.new as { sender_id: string }).sender_id === userId) return;
        void markThreadsDelivered();
        void refresh();
      })
      // My own read marks (opening a chat) clear the badge.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_participants', filter: `user_id=eq.${userId}` }, () => {
        void refresh();
      })
      .subscribe();

    // Messages that arrived while the app was in the background.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void markThreadsDelivered();
        void refresh();
      }
    });

    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return unread;
}
