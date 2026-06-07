import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  Image, Modal, Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { colors } from '../theme/colors';
import ChatBubble from './chat/ChatBubble';
import TypingIndicator from './chat/TypingIndicator';
import MediaPicker from './chat/MediaPicker';
import ChatListScreen from './chat/ChatListScreen';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Date separator ────────────────────────────────────────────────────────────
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
    <View style={styles.dateSeparator}>
      <View style={styles.dateLine} />
      <Text style={styles.dateText}>{formatDate(date)}</Text>
      <View style={styles.dateLine} />
    </View>
  );
}

// ─── Full screen media viewer ──────────────────────────────────────────────────
function MediaViewer({ visible, media, onClose }) {
  if (!visible || !media) return null;

  const isVideo = media.media_type === 'video';
  const uri = media.media_url;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.mediaViewerBg}>
        <TouchableOpacity style={styles.mediaViewerClose} onPress={onClose}>
          <Ionicons name="close" size={28} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.mediaViewerContent}>
          {isVideo ? (
            <View style={styles.videoPlaceholder}>
              <Ionicons name="videocam" size={48} color={colors.white} />
              <Text style={styles.videoPlaceholderText}>
                Aperçu vidéo non disponible dans l'app.{'\n'}Appuyez pour ouvrir.
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri }}
              style={styles.mediaViewerImage}
              resizeMode="contain"
            />
          )}
        </View>
        {media.sender_name && (
          <Text style={styles.mediaViewerCaption}>
            Envoyé par {media.sender_name}
          </Text>
        )}
      </View>
    </Modal>
  );
}

// ─── Chat view for a single event ──────────────────────────────────────────────
function EventChat({ event, onBack }) {
  const { user, profile, isStaff } = useAuthStore();
  const {
    chatsByEvent, typingUsers, subscribeToChat,
    unsubscribeFromChat, loadMessages, sendMessage,
    sendMediaMessage, setTyping, markAsRead,
    setActiveEvent, clearActiveEvent,
  } = useChatStore();

  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);
  const [inputText, setInputText] = useState('');
  const [mediaViewerMedia, setMediaViewerMedia] = useState(null);
  const typingTimeoutRef = useRef(null);
  const typingClearTimersRef = useRef({});

  const eventId = event.id;
  const eventTitle = event.title;
  const chatData = chatsByEvent[eventId] || { messages: [], loading: true };
  const currentTyping = typingUsers[eventId] || [];

  const senderName = profile?.full_name || profile?.business_name || 'Utilisateur';
  const senderRole = isStaff ? 'staff' : 'organizer';

  // Fade-in animation
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
  }, []);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Subscribe to realtime + load messages
  useEffect(() => {
    if (!user || !eventId) return;
    loadMessages(eventId);
    subscribeToChat(eventId, user.id);
    markAsRead(eventId, user.id);
    setActiveEvent(eventId, eventTitle);

    return () => {
      unsubscribeFromChat(eventId);
      clearActiveEvent();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      // Clear all typing safety timers
      Object.values(typingClearTimersRef.current).forEach(clearTimeout);
      typingClearTimersRef.current = {};
    };
  }, [eventId, user?.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (chatData.messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [chatData.messages.length]);

  // Mark as read when viewing
  useEffect(() => {
    if (chatData.messages.length > 0 && user) {
      markAsRead(eventId, user.id);
    }
  }, [chatData.messages.length]);

  // Safety: auto-clear typing indicator after 5 seconds (receiver side)
  // This prevents stuck indicators when presence sync fails
  useEffect(() => {
    // Clear old timers for users no longer typing
    Object.keys(typingClearTimersRef.current).forEach(userId => {
      if (!currentTyping.find(u => u.userId === userId)) {
        clearTimeout(typingClearTimersRef.current[userId]);
        delete typingClearTimersRef.current[userId];
      }
    });

    // Set new safety timers for currently typing users
    currentTyping.forEach(u => {
      if (!typingClearTimersRef.current[u.userId]) {
        typingClearTimersRef.current[u.userId] = setTimeout(() => {
          // Force clear this user's typing status locally
          useChatStore.setState(state => {
            const list = (state.typingUsers[eventId] || []).filter(
              t => t.userId !== u.userId
            );
            return {
              typingUsers: { ...state.typingUsers, [eventId]: list },
            };
          });
          delete typingClearTimersRef.current[u.userId];
        }, 5000);
      }
    });
  }, [currentTyping, eventId]);

  // Handle typing indicator
  const handleTextChange = (text) => {
    setInputText(text);

    // Send typing status
    if (text.length > 0) {
      setTyping(eventId, user.id, senderName, true);

      // Clear typing after 3 seconds of no input
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setTyping(eventId, user.id, senderName, false);
      }, 3000);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setTyping(eventId, user.id, senderName, false);
    }
  };

  // Send text message
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    setInputText('');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTyping(eventId, user.id, senderName, false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    await sendMessage(eventId, text, senderName, senderRole);
  };

  // Send media message
  const handleMediaSent = async (mediaUrl, mediaType, thumbnailUrl) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await sendMediaMessage(eventId, mediaUrl, mediaType, thumbnailUrl, senderName, senderRole);
  };

  // Load more on scroll to top
  const handleLoadMore = () => {
    useChatStore.getState().loadMore(eventId);
  };

  // Group messages by date for separators
  const getMessagesWithSeparators = () => {
    const items = [];
    let lastDate = null;

    chatData.messages.forEach((msg) => {
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
    if (item.type === 'date') {
      return <DateSeparator date={item.date} />;
    }
    return (
      <ChatBubble
        message={item}
        isOwn={item.sender_id === user?.id}
        onMediaPress={(media) => setMediaViewerMedia(media)}
      />
    );
  };

  return (
    <View style={styles.fill}>
      {/* Header */}
      <LinearGradient
        colors={isStaff ? ['#7C3AED', '#A855F7'] : colors.gradientHeader}
        style={[styles.chatHeader, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.chatHeaderInfo}>
          <Text style={styles.chatHeaderTitle} numberOfLines={1}>{eventTitle}</Text>
          <Text style={styles.chatHeaderSub}>
            Chat Staff · {senderRole === 'organizer' ? 'Organisateur' : 'Staff'}
          </Text>
        </View>
        <View style={styles.chatHeaderDot}>
          <View style={styles.onlineDot} />
        </View>
      </LinearGradient>

      {/* Messages + Input wrapped in KeyboardAvoidingView */}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Messages */}
        <Animated.View style={[styles.messagesContainer, fadeStyle]}>
          {chatData.loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.blue} />
              <Text style={styles.loadingText}>Chargement des messages…</Text>
            </View>
          ) : chatData.messages.length === 0 ? (
            <View style={styles.emptyChat}>
              <View style={styles.emptyChatIcon}>
                <Ionicons name="chatbubbles-outline" size={48} color={colors.textDim} />
              </View>
              <Text style={styles.emptyChatTitle}>Commencez la discussion !</Text>
              <Text style={styles.emptyChatText}>
                Envoyez un message à votre équipe pour coordonner l'événement.
              </Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={getMessagesWithSeparators()}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              onEndReachedThreshold={0.1}
              onStartReached={handleLoadMore}
              ListHeaderComponent={
                chatData.messages.length >= 100 ? (
                  <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
                    <Text style={styles.loadMoreText}>Charger les messages précédents</Text>
                  </TouchableOpacity>
                ) : null
              }
            />
          )}

          {/* Typing indicator */}
          {currentTyping.length > 0 && (
            <TypingIndicator users={currentTyping} />
          )}
        </Animated.View>

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <MediaPicker
            eventId={eventId}
            onMediaSent={handleMediaSent}
            senderName={senderName}
            senderRole={senderRole}
            disabled={chatData.loading}
          />

          <View style={styles.inputWrap}>
            <TextInput
              style={styles.textInput}
              placeholder="Votre message…"
              placeholderTextColor={colors.textDim}
              value={inputText}
              onChangeText={handleTextChange}
              multiline
              maxLength={2000}
              editable={!chatData.loading}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.sendBtn,
              inputText.trim().length > 0 ? styles.sendBtnActive : styles.sendBtnInactive,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim()}
            activeOpacity={0.7}
          >
            <Ionicons
              name="send"
              size={18}
              color={inputText.trim().length > 0 ? colors.white : colors.textDim}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Media viewer modal */}
      <MediaViewer
        visible={!!mediaViewerMedia}
        media={mediaViewerMedia}
        onClose={() => setMediaViewerMedia(null)}
      />
    </View>
  );
}

// ─── Main ChatScreen ───────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { user, profile, isStaff, staffEventId, staffEventTitle } = useAuthStore();
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Staff mode: go directly to their event chat
  useEffect(() => {
    if (isStaff && staffEventId) {
      setSelectedEvent({ id: staffEventId, title: staffEventTitle || 'Événement' });
    }
  }, [isStaff, staffEventId, staffEventTitle]);

  // If an event is selected, show the chat
  if (selectedEvent) {
    return (
      <EventChat
        event={selectedEvent}
        onBack={() => {
          if (isStaff) return; // Staff can't go back to list
          setSelectedEvent(null);
        }}
      />
    );
  }

  // Organizer: show event list
  return (
    <View style={styles.fill}>
      <View style={[styles.listContainer]}>
        <ChatListScreen
          userId={user?.id}
          onSelectEvent={(evt) => setSelectedEvent(evt)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContainer: {
    flex: 1,
    padding: 20,
  },

  // ─── Chat Header ─────────────────────────────────────────────────
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: -0.2,
  },
  chatHeaderSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    marginTop: 1,
  },
  chatHeaderDot: {
    marginLeft: 8,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },

  // ─── Messages area ───────────────────────────────────────────────
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    paddingVertical: 12,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 10,
  },

  // ─── Empty chat ──────────────────────────────────────────────────
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyChatIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyChatTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyChatText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ─── Date separator ─────────────────────────────────────────────
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    paddingHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // ─── Input bar ──────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  inputWrap: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    maxHeight: 120,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 20,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  sendBtnActive: {
    backgroundColor: colors.blue,
  },
  sendBtnInactive: {
    backgroundColor: colors.surfaceAlt,
  },

  // ─── Load more ──────────────────────────────────────────────────
  loadMoreBtn: {
    alignItems: 'center',
    padding: 12,
  },
  loadMoreText: {
    fontSize: 13,
    color: colors.blue,
    fontWeight: '600',
  },

  // ─── Media viewer ───────────────────────────────────────────────
  mediaViewerBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaViewerContent: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaViewerImage: {
    width: SCREEN_WIDTH - 20,
    height: SCREEN_HEIGHT * 0.65,
  },
  mediaViewerCaption: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 16,
  },
  videoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  videoPlaceholderText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
});
