// Admin Chat Monitor — Read-only view of all event chats
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, Image, Modal, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Event Chat Card ──────────────────────────────────────────────────────────
function EventChatCard({ event, onPress }) {
  const { lastMessage, messageCount, staffCount } = event;
  
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

  const getPreview = (msg) => {
    if (!msg) return 'Aucun message';
    if (msg.media_type === 'image') return `${msg.sender_name}: 📷 Photo`;
    if (msg.media_type === 'video') return `${msg.sender_name}: 🎬 Vidéo`;
    const text = msg.content || '';
    return `${msg.sender_name}: ${text.length > 50 ? text.substring(0, 50) + '…' : text}`;
  };

  return (
    <TouchableOpacity style={styles.chatCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.chatCardIcon}>
        <Ionicons name="chatbubble-ellipses" size={22} color={colors.blue} />
      </View>
      <View style={styles.chatCardContent}>
        <View style={styles.chatCardTopRow}>
          <Text style={styles.chatCardTitle} numberOfLines={1}>{event.title}</Text>
          {lastMessage && (
            <Text style={styles.chatCardTime}>{formatTimeAgo(lastMessage.created_at)}</Text>
          )}
        </View>
        <Text style={styles.chatCardPreview} numberOfLines={1}>
          {getPreview(lastMessage)}
        </Text>
        <View style={styles.chatCardMeta}>
          <View style={styles.metaChip}>
            <Ionicons name="chatbubble" size={10} color={colors.blue} style={{ marginRight: 3 }} />
            <Text style={styles.metaChipText}>{messageCount} msg</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="people" size={10} color="#7C3AED" style={{ marginRight: 3 }} />
            <Text style={styles.metaChipText}>{staffCount} staff</Text>
          </View>
          <Text style={styles.metaOrganizer} numberOfLines={1}>
            {event.organizer_name || 'Organisateur'}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
    </TouchableOpacity>
  );
}

// ─── Chat Message Bubble (Read-only admin view) ──────────────────────────────
function AdminChatBubble({ message }) {
  const isOrganizer = message.sender_role === 'organizer';
  const hasMedia = !!message.media_url;

  const formatTime = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <View style={styles.msgRow}>
      <View style={[styles.msgAvatar, { backgroundColor: isOrganizer ? colors.bluePale : '#EDE9FE' }]}>
        <Ionicons
          name={isOrganizer ? 'person' : 'people'}
          size={14}
          color={isOrganizer ? colors.blue : '#7C3AED'}
        />
      </View>
      <View style={styles.msgContent}>
        <View style={styles.msgHeader}>
          <Text style={[styles.msgSender, { color: isOrganizer ? colors.blue : '#7C3AED' }]}>
            {message.sender_name}
          </Text>
          <View style={[styles.msgRoleBadge, { backgroundColor: isOrganizer ? colors.bluePale : '#EDE9FE' }]}>
            <Text style={[styles.msgRoleText, { color: isOrganizer ? colors.blue : '#7C3AED' }]}>
              {isOrganizer ? 'Org.' : 'Staff'}
            </Text>
          </View>
          <Text style={styles.msgTime}>{formatTime(message.created_at)}</Text>
        </View>

        {hasMedia && (
          <View style={styles.msgMediaWrap}>
            <Image
              source={{ uri: message.media_thumbnail || message.media_url }}
              style={styles.msgMediaImage}
              resizeMode="cover"
            />
            {message.media_type === 'video' && (
              <View style={styles.msgVideoOverlay}>
                <Ionicons name="play" size={18} color={colors.white} />
              </View>
            )}
          </View>
        )}

        {message.content && (
          <Text style={styles.msgText}>{message.content}</Text>
        )}
      </View>
    </View>
  );
}

// ─── Date Separator ──────────────────────────────────────────────────────────
function DateSeparator({ date }) {
  const formatDate = (dateStr) => {
    try {
      const d = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
      if (d.toDateString() === yesterday.toDateString()) return 'Hier';
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return ''; }
  };

  return (
    <View style={styles.dateSep}>
      <View style={styles.dateLineAdmin} />
      <Text style={styles.dateTextAdmin}>{formatDate(date)}</Text>
      <View style={styles.dateLineAdmin} />
    </View>
  );
}

// ─── Chat Detail View ────────────────────────────────────────────────────────
function AdminChatDetail({ event, onBack }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
  }, [event.id]);

  const fetchMessages = async () => {
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('event_id', event.id)
        .order('created_at', { ascending: true })
        .limit(200);

      setMessages(data || []);
    } catch (err) {
      console.error('Admin fetch messages error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Group messages with date separators
  const getItemsWithDates = () => {
    const items = [];
    let lastDate = null;
    messages.forEach((msg) => {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== lastDate) {
        items.push({ type: 'date', date: msg.created_at, id: `date-${msgDate}` });
        lastDate = msgDate;
      }
      items.push({ type: 'message', ...msg });
    });
    return items;
  };

  const renderItem = ({ item }) => {
    if (item.type === 'date') return <DateSeparator date={item.date} />;
    return <AdminChatBubble message={item} />;
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.detailHeader}>
        <TouchableOpacity style={styles.detailBackBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={18} color={colors.blue} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailTitle} numberOfLines={1}>{event.title}</Text>
          <Text style={styles.detailSub}>
            {event.organizer_name} · {messages.length} messages
          </Text>
        </View>
        <View style={styles.readOnlyBadge}>
          <Ionicons name="eye" size={12} color={colors.textMuted} style={{ marginRight: 3 }} />
          <Text style={styles.readOnlyText}>Lecture seule</Text>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.blue} />
          <Text style={styles.loaderText}>Chargement…</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Aucun message</Text>
          <Text style={styles.emptyText}>Cet événement n'a pas encore de messages de chat.</Text>
        </View>
      ) : (
        <FlatList
          data={getItemsWithDates()}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Main Admin Chat Screen ──────────────────────────────────────────────────
export default function AdminChatsScreen({ refreshing, onRefreshComplete }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      // Get ALL events that have chat messages
      const { data: eventsWithMessages } = await supabase
        .from('chat_messages')
        .select('event_id')
        .order('created_at', { ascending: false });

      if (!eventsWithMessages || eventsWithMessages.length === 0) {
        setEvents([]);
        setLoading(false);
        if (onRefreshComplete) onRefreshComplete();
        return;
      }

      // Get unique event IDs
      const uniqueEventIds = [...new Set(eventsWithMessages.map(m => m.event_id))];

      // Fetch event details + stats
      const enriched = await Promise.all(
        uniqueEventIds.map(async (eventId) => {
          const { data: event } = await supabase
            .from('events')
            .select('id, title, organizer_id, status')
            .eq('id', eventId)
            .single();

          if (!event) return null;

          // Get organizer name
          const { data: organizer } = await supabase
            .from('profiles')
            .select('full_name, business_name')
            .eq('id', event.organizer_id)
            .single();

          // Message count
          const { count: messageCount } = await supabase
            .from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', eventId);

          // Staff count
          const { count: staffCount } = await supabase
            .from('event_staff')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .eq('status', 'active');

          // Last message
          const { data: lastMsg } = await supabase
            .from('chat_messages')
            .select('content, sender_name, created_at, media_type')
            .eq('event_id', eventId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          return {
            ...event,
            organizer_name: organizer?.business_name || organizer?.full_name || 'Inconnu',
            messageCount: messageCount || 0,
            staffCount: staffCount || 0,
            lastMessage: lastMsg || null,
          };
        })
      );

      // Filter nulls and sort by last message time
      const filtered = enriched.filter(Boolean).sort((a, b) => {
        const timeA = a.lastMessage?.created_at || '1970-01-01';
        const timeB = b.lastMessage?.created_at || '1970-01-01';
        return new Date(timeB) - new Date(timeA);
      });

      setEvents(filtered);
    } catch (err) {
      console.error('AdminChatsScreen error:', err);
    } finally {
      setLoading(false);
      if (onRefreshComplete) onRefreshComplete();
    }
  }, [onRefreshComplete]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (refreshing) { setLoading(true); fetchData(); } }, [refreshing, fetchData]);

  // Chat detail view
  if (selectedEvent) {
    return (
      <AdminChatDetail
        event={selectedEvent}
        onBack={() => setSelectedEvent(null)}
      />
    );
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>Aucun chat actif</Text>
        <Text style={styles.emptyText}>
          Les discussions des événements apparaîtront ici une fois que les organisateurs et staffs commenceront à communiquer.
        </Text>
      </View>
    );
  }

  const totalMessages = events.reduce((sum, e) => sum + e.messageCount, 0);

  return (
    <View>
      {/* Info banner */}
      <View style={styles.adminBanner}>
        <Ionicons name="eye" size={16} color={colors.blue} style={{ marginRight: 8 }} />
        <Text style={styles.adminBannerText}>
          Mode supervision · {events.length} discussion{events.length > 1 ? 's' : ''} · {totalMessages} messages
        </Text>
      </View>

      {/* Chat list */}
      {events.map((evt) => (
        <EventChatCard
          key={evt.id}
          event={evt}
          onPress={() => setSelectedEvent(evt)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { padding: 40, alignItems: 'center' },
  loaderText: { color: colors.textMuted, fontSize: 13, marginTop: 10 },

  emptyWrap: { alignItems: 'center', padding: 40 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  adminBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bluePale,
    borderWidth: 1, borderColor: colors.blueBorder, borderRadius: 12,
    padding: 12, marginBottom: 16,
  },
  adminBannerText: { flex: 1, fontSize: 13, color: colors.blue, fontWeight: '600', lineHeight: 18 },

  // ─── Chat Card ──────────────────────────────────────────────────
  chatCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  chatCardIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: colors.bluePale,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  chatCardContent: { flex: 1 },
  chatCardTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3,
  },
  chatCardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
  chatCardTime: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  chatCardPreview: { fontSize: 13, color: colors.textMuted, marginBottom: 5 },
  chatCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  metaChipText: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  metaOrganizer: { fontSize: 10, color: colors.textMuted, fontWeight: '500', flex: 1 },

  // ─── Detail Header ──────────────────────────────────────────────
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 8,
  },
  detailBackBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bluePale,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  detailTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  detailSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  readOnlyBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  readOnlyText: { fontSize: 10, fontWeight: '600', color: colors.textMuted },

  // ─── Messages List ──────────────────────────────────────────────
  messagesList: { paddingVertical: 8 },

  // ─── Message Row ────────────────────────────────────────────────
  msgRow: {
    flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8,
    paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  msgAvatar: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center',
    justifyContent: 'center', marginRight: 10, marginTop: 2,
  },
  msgContent: { flex: 1 },
  msgHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  msgSender: { fontSize: 13, fontWeight: '700' },
  msgRoleBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  msgRoleText: { fontSize: 9, fontWeight: '700' },
  msgTime: { fontSize: 10, color: colors.textMuted, marginLeft: 'auto' },
  msgText: { fontSize: 14, color: colors.text, lineHeight: 20 },

  // Media in admin view
  msgMediaWrap: {
    borderRadius: 10, overflow: 'hidden', marginBottom: 4,
    maxWidth: SCREEN_WIDTH * 0.5,
  },
  msgMediaImage: {
    width: SCREEN_WIDTH * 0.45, height: 120, borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
  msgVideoOverlay: {
    ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10,
  },

  // Date separator
  dateSep: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  dateLineAdmin: { flex: 1, height: 1, backgroundColor: colors.border },
  dateTextAdmin: {
    fontSize: 10, fontWeight: '600', color: colors.textMuted, paddingHorizontal: 10,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
});
