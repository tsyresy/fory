import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useChatStore } from '../../store/chatStore';
import { colors } from '../../theme/colors';

export default function ChatListScreen({ userId, onSelectEvent }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastMessages, setLastMessages] = useState({}); // { eventId: message }
  const { unreadCounts } = useChatStore();

  const fetchEvents = useCallback(async () => {
    try {
      // Get organizer's active events
      const { data: orgEvents } = await supabase
        .from('events')
        .select('id, title, status, start_date, end_date, staff_code')
        .eq('organizer_id', userId)
        .in('status', ['approved', 'published'])
        .order('created_at', { ascending: false });

      if (!orgEvents || orgEvents.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      // Filter out expired events
      const now = new Date();
      const activeEvents = orgEvents.filter(evt => {
        const endDate = evt.end_date ? new Date(evt.end_date) : (evt.start_date ? new Date(evt.start_date) : null);
        return !endDate || endDate >= now;
      });

      // For each event, get the staff count and last message
      const enriched = await Promise.all(
        activeEvents.map(async (evt) => {
          // Staff count
          const { count: staffCount } = await supabase
            .from('event_staff')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', evt.id)
            .eq('status', 'active');

          // Last message
          const { data: lastMsg } = await supabase
            .from('chat_messages')
            .select('content, sender_name, created_at, media_type')
            .eq('event_id', evt.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          return {
            ...evt,
            staffCount: staffCount || 0,
            lastMessage: lastMsg || null,
          };
        })
      );

      setEvents(enriched);

      // Load unread counts
      const eventIds = enriched.map(e => e.id);
      useChatStore.getState().loadUnreadCounts(eventIds, userId);
    } catch (err) {
      console.error('ChatListScreen fetchEvents error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return 'À l\'instant';
      if (diffMin < 60) return `il y a ${diffMin}min`;
      if (diffHrs < 24) return `il y a ${diffHrs}h`;
      if (diffDays < 7) return `il y a ${diffDays}j`;
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch { return ''; }
  };

  const getLastMessagePreview = (msg) => {
    if (!msg) return 'Aucun message';
    if (msg.media_type === 'image') return `${msg.sender_name}: 📷 Photo`;
    if (msg.media_type === 'video') return `${msg.sender_name}: 🎬 Vidéo`;
    return `${msg.sender_name}: ${msg.content}`;
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={styles.loaderText}>Chargement des chats…</Text>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>Aucun chat disponible</Text>
        <Text style={styles.emptyText}>
          Les chats sont disponibles pour vos événements actifs avec des staffs assignés.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.headerRow}>
        <View style={styles.headerIconBox}>
          <Ionicons name="chatbubbles" size={18} color={colors.blue} />
        </View>
        <Text style={styles.headerTitle}>Chat Staff</Text>
        <Text style={styles.headerCount}>{events.length} discussion{events.length > 1 ? 's' : ''}</Text>
      </View>

      {events.map((evt) => {
        const unread = unreadCounts[evt.id] || 0;
        return (
          <TouchableOpacity
            key={evt.id}
            style={styles.chatItem}
            onPress={() => onSelectEvent(evt)}
            activeOpacity={0.7}
          >
            <View style={[styles.chatIcon, unread > 0 && styles.chatIconUnread]}>
              <Ionicons
                name="chatbubble-ellipses"
                size={20}
                color={unread > 0 ? colors.blue : colors.textMuted}
              />
            </View>

            <View style={styles.chatContent}>
              <View style={styles.chatTopRow}>
                <Text style={[styles.chatTitle, unread > 0 && styles.chatTitleUnread]} numberOfLines={1}>
                  {evt.title}
                </Text>
                {evt.lastMessage && (
                  <Text style={[styles.chatTime, unread > 0 && styles.chatTimeUnread]}>
                    {formatTimeAgo(evt.lastMessage.created_at)}
                  </Text>
                )}
              </View>

              <View style={styles.chatBottomRow}>
                <Text style={[styles.chatPreview, unread > 0 && styles.chatPreviewUnread]} numberOfLines={1}>
                  {getLastMessagePreview(evt.lastMessage)}
                </Text>
                {unread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                )}
              </View>

              <View style={styles.chatMeta}>
                <Ionicons name="people" size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
                <Text style={styles.chatMetaText}>
                  {evt.staffCount} staff{evt.staffCount !== 1 ? 's' : ''} actif{evt.staffCount !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    alignItems: 'center',
    padding: 40,
  },
  loaderText: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 10,
  },

  emptyWrap: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.bluePale,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  headerCount: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },

  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  chatIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  chatIconUnread: {
    backgroundColor: colors.bluePale,
  },
  chatContent: {
    flex: 1,
  },
  chatTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  chatTitleUnread: {
    fontWeight: '700',
  },
  chatTime: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  chatTimeUnread: {
    color: colors.blue,
    fontWeight: '700',
  },
  chatBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chatPreview: {
    fontSize: 13,
    color: colors.textMuted,
    flex: 1,
    marginRight: 8,
  },
  chatPreviewUnread: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: colors.blue,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  unreadText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  chatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatMetaText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
