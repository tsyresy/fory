import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { sendLocalChatNotification } from '../lib/notifications';

export const useChatStore = create((set, get) => ({
  // State
  chatsByEvent: {},        // { eventId: { messages: [], loading: false } }
  unreadCounts: {},        // { eventId: number }
  typingUsers: {},         // { eventId: [{ userId, userName }] }
  totalUnread: 0,
  subscriptions: {},       // { eventId: channel }
  activeEventId: null,     // Currently viewed event chat (suppress notifications)
  eventTitles: {},         // { eventId: title } for notification display

  // ─── Load initial messages for an event ─────────────────────────────
  loadMessages: async (eventId) => {
    set(state => ({
      chatsByEvent: {
        ...state.chatsByEvent,
        [eventId]: { ...(state.chatsByEvent[eventId] || {}), messages: state.chatsByEvent[eventId]?.messages || [], loading: true },
      },
    }));

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (!error && data) {
      set(state => ({
        chatsByEvent: {
          ...state.chatsByEvent,
          [eventId]: { messages: data, loading: false },
        },
      }));
    } else {
      set(state => ({
        chatsByEvent: {
          ...state.chatsByEvent,
          [eventId]: { ...(state.chatsByEvent[eventId] || {}), loading: false },
        },
      }));
    }
  },

  // ─── Load more (pagination) ─────────────────────────────────────────
  loadMore: async (eventId) => {
    const existing = get().chatsByEvent[eventId]?.messages || [];
    if (existing.length === 0) return;

    const oldest = existing[0];
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('event_id', eventId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: true })
      .limit(50);

    if (data && data.length > 0) {
      set(state => ({
        chatsByEvent: {
          ...state.chatsByEvent,
          [eventId]: {
            ...state.chatsByEvent[eventId],
            messages: [...data, ...existing],
          },
        },
      }));
    }
  },

  // ─── Add a single message (optimistic + realtime) ───────────────────
  addMessage: (eventId, message) => {
    set(state => {
      const existing = state.chatsByEvent[eventId]?.messages || [];
      // Avoid duplicates (optimistic + realtime can both fire)
      if (existing.find(m => m.id === message.id)) return state;

      // If this is a real message from DB, replace the matching optimistic message
      // (optimistic messages have sender_id + similar created_at + _sending flag)
      const pendingIdx = existing.findIndex(
        m => m._sending && m.sender_id === message.sender_id && m.event_id === message.event_id
          && m.content === message.content && m.media_url === message.media_url
      );
      if (pendingIdx !== -1) {
        const updated = [...existing];
        updated[pendingIdx] = message;
        return {
          chatsByEvent: {
            ...state.chatsByEvent,
            [eventId]: {
              ...state.chatsByEvent[eventId],
              messages: updated,
            },
          },
        };
      }

      return {
        chatsByEvent: {
          ...state.chatsByEvent,
          [eventId]: {
            ...state.chatsByEvent[eventId],
            messages: [...existing, message],
          },
        },
      };
    });
  },

  // ─── Send a text message ────────────────────────────────────────────
  sendMessage: async (eventId, content, senderName, senderRole) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return null;

    const optimisticId = `temp-${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      event_id: eventId,
      sender_id: user.id,
      sender_name: senderName,
      sender_role: senderRole,
      content,
      media_url: null,
      media_type: null,
      media_thumbnail: null,
      created_at: new Date().toISOString(),
      _sending: true,
    };

    // Optimistic insert
    get().addMessage(eventId, optimistic);

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        event_id: eventId,
        sender_id: user.id,
        sender_name: senderName,
        sender_role: senderRole,
        content,
      })
      .select()
      .single();

    if (error) {
      // Mark as failed
      set(state => {
        const msgs = (state.chatsByEvent[eventId]?.messages || []).map(m =>
          m.id === optimisticId ? { ...m, _sending: false, _error: true } : m
        );
        return {
          chatsByEvent: {
            ...state.chatsByEvent,
            [eventId]: { ...state.chatsByEvent[eventId], messages: msgs },
          },
        };
      });
      return null;
    }

    // Replace optimistic with real message immediately (don't wait for realtime)
    set(state => {
      const msgs = (state.chatsByEvent[eventId]?.messages || []).map(
        m => m.id === optimisticId ? data : m
      );
      return {
        chatsByEvent: {
          ...state.chatsByEvent,
          [eventId]: { ...state.chatsByEvent[eventId], messages: msgs },
        },
      };
    });

    return data;
  },

  // ─── Send a media message ──────────────────────────────────────────
  sendMediaMessage: async (eventId, mediaUrl, mediaType, mediaThumbnail, senderName, senderRole) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return null;

    const optimisticId = `temp-${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      event_id: eventId,
      sender_id: user.id,
      sender_name: senderName,
      sender_role: senderRole,
      content: null,
      media_url: mediaUrl,
      media_type: mediaType,
      media_thumbnail: mediaThumbnail,
      created_at: new Date().toISOString(),
      _sending: true,
    };

    get().addMessage(eventId, optimistic);

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        event_id: eventId,
        sender_id: user.id,
        sender_name: senderName,
        sender_role: senderRole,
        media_url: mediaUrl,
        media_type: mediaType,
        media_thumbnail: mediaThumbnail,
      })
      .select()
      .single();

    if (error) {
      set(state => {
        const msgs = (state.chatsByEvent[eventId]?.messages || []).map(m =>
          m.id === optimisticId ? { ...m, _sending: false, _error: true } : m
        );
        return {
          chatsByEvent: {
            ...state.chatsByEvent,
            [eventId]: { ...state.chatsByEvent[eventId], messages: msgs },
          },
        };
      });
      return null;
    }

    // Replace optimistic with real message immediately (don't wait for realtime)
    set(state => {
      const msgs = (state.chatsByEvent[eventId]?.messages || []).map(
        m => m.id === optimisticId ? data : m
      );
      return {
        chatsByEvent: {
          ...state.chatsByEvent,
          [eventId]: { ...state.chatsByEvent[eventId], messages: msgs },
        },
      };
    });

    return data;
  },

  // ─── Subscribe to realtime messages ─────────────────────────────────
  subscribeToChat: (eventId, currentUserId) => {
    const existing = get().subscriptions[eventId];
    if (existing) return; // Already subscribed

    const channel = supabase
      .channel(`chat:${eventId}`)
      // Listen for new messages
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const msg = payload.new;
          get().addMessage(eventId, msg);

          // Clear typing indicator for the sender (they just sent a message)
          set(state => {
            const currentList = state.typingUsers[eventId] || [];
            if (currentList.some(t => t.userId === msg.sender_id)) {
              return {
                typingUsers: {
                  ...state.typingUsers,
                  [eventId]: currentList.filter(t => t.userId !== msg.sender_id),
                },
              };
            }
            return state;
          });

          // Increment unread if sender is not current user
          if (msg.sender_id !== currentUserId) {
            set(state => {
              const newCount = (state.unreadCounts[eventId] || 0) + 1;
              const newUnreadCounts = { ...state.unreadCounts, [eventId]: newCount };
              const totalUnread = Object.values(newUnreadCounts).reduce((a, b) => a + b, 0);
              return { unreadCounts: newUnreadCounts, totalUnread };
            });

            // Send local push notification if not viewing this chat
            const currentActive = get().activeEventId;
            if (currentActive !== eventId) {
              const eventTitle = get().eventTitles[eventId] || 'Chat Staff';
              sendLocalChatNotification(
                msg.sender_name,
                msg.content,
                eventTitle,
                msg.media_type
              ).catch(() => {});
            }
          }
        }
      )
      // Presence: typing indicators
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const typingList = [];
        Object.values(presenceState).forEach(presences => {
          presences.forEach(p => {
            if (p.typing && p.userId !== currentUserId) {
              typingList.push({ userId: p.userId, userName: p.userName });
            }
          });
        });
        set(state => ({
          typingUsers: { ...state.typingUsers, [eventId]: typingList },
        }));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track our presence (not typing initially)
          await channel.track({ typing: false, userId: currentUserId, userName: '' });
        }
      });

    set(state => ({
      subscriptions: { ...state.subscriptions, [eventId]: channel },
    }));
  },

  // ─── Unsubscribe from chat ──────────────────────────────────────────
  unsubscribeFromChat: (eventId) => {
    const channel = get().subscriptions[eventId];
    if (channel) {
      supabase.removeChannel(channel);
      set(state => {
        const subs = { ...state.subscriptions };
        delete subs[eventId];
        return { subscriptions: subs };
      });
    }
  },

  // ─── Set typing status ─────────────────────────────────────────────
  setTyping: async (eventId, userId, userName, isTyping) => {
    const channel = get().subscriptions[eventId];
    if (channel) {
      await channel.track({ typing: isTyping, userId, userName });
    }
  },

  // ─── Mark chat as read ─────────────────────────────────────────────
  markAsRead: async (eventId, userId) => {
    set(state => {
      const newUnreadCounts = { ...state.unreadCounts, [eventId]: 0 };
      const totalUnread = Object.values(newUnreadCounts).reduce((a, b) => a + b, 0);
      return { unreadCounts: newUnreadCounts, totalUnread };
    });

    // Upsert read receipt
    await supabase
      .from('chat_read_receipts')
      .upsert(
        { event_id: eventId, user_id: userId, last_read_at: new Date().toISOString() },
        { onConflict: 'event_id,user_id' }
      );
  },

  // ─── Load unread counts for all events ─────────────────────────────
  loadUnreadCounts: async (eventIds, userId) => {
    if (!eventIds || eventIds.length === 0) return;

    // Get read receipts
    const { data: receipts } = await supabase
      .from('chat_read_receipts')
      .select('event_id, last_read_at')
      .eq('user_id', userId)
      .in('event_id', eventIds);

    const receiptMap = {};
    (receipts || []).forEach(r => { receiptMap[r.event_id] = r.last_read_at; });

    // For each event, count unread messages
    const counts = {};
    let total = 0;
    for (const eventId of eventIds) {
      const lastRead = receiptMap[eventId] || '1970-01-01T00:00:00Z';
      const { count } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .gt('created_at', lastRead)
        .neq('sender_id', userId);
      
      counts[eventId] = count || 0;
      total += counts[eventId];
    }

    set({ unreadCounts: counts, totalUnread: total });
  },

  // ─── Set active event (suppress notifications for viewed chat) ────
  setActiveEvent: (eventId, eventTitle) => {
    set({ activeEventId: eventId });
    if (eventTitle) {
      set(state => ({
        eventTitles: { ...state.eventTitles, [eventId]: eventTitle },
      }));
    }
  },

  clearActiveEvent: () => {
    set({ activeEventId: null });
  },

  // ─── Register event title (for notifications) ─────────────────────
  registerEventTitle: (eventId, title) => {
    set(state => ({
      eventTitles: { ...state.eventTitles, [eventId]: title },
    }));
  },

  // ─── Reset store ───────────────────────────────────────────────────
  reset: () => {
    // Unsubscribe from all channels
    const subs = get().subscriptions;
    Object.values(subs).forEach(channel => {
      supabase.removeChannel(channel);
    });
    set({
      chatsByEvent: {},
      unreadCounts: {},
      typingUsers: {},
      totalUnread: 0,
      subscriptions: {},
      activeEventId: null,
      eventTitles: {},
    });
  },
}));
