import React, { memo } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_BUBBLE_WIDTH = SCREEN_WIDTH * 0.75;

function ChatBubble({ message, isOwn, onMediaPress }) {
  const isOrganizer = message.sender_role === 'organizer';
  const hasMedia = !!message.media_url;
  const hasText = !!message.content;
  const isSending = message._sending;
  const hasError = message._error;

  const formatTime = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <View style={[styles.container, isOwn ? styles.containerRight : styles.containerLeft]}>
      {/* Sender name (only for others) */}
      {!isOwn && (
        <View style={styles.senderRow}>
          <View style={[
            styles.senderDot,
            { backgroundColor: isOrganizer ? colors.blue : '#7C3AED' },
          ]} />
          <Text style={[
            styles.senderName,
            { color: isOrganizer ? colors.blue : '#7C3AED' },
          ]}>
            {message.sender_name}
          </Text>
          <Text style={styles.roleBadge}>
            {isOrganizer ? 'Organisateur' : 'Staff'}
          </Text>
        </View>
      )}

      {/* Bubble */}
      <View style={[
        styles.bubble,
        isOwn ? styles.bubbleOwn : styles.bubbleOther,
        isOrganizer && !isOwn && styles.bubbleOrganizer,
        hasMedia && styles.bubbleMedia,
      ]}>
        {/* Media content */}
        {hasMedia && (
          <TouchableOpacity
            style={styles.mediaWrap}
            onPress={() => onMediaPress && onMediaPress(message)}
            activeOpacity={0.85}
          >
            <Image
              source={{ uri: message.media_thumbnail || message.media_url }}
              style={styles.mediaImage}
              resizeMode="cover"
            />
            {message.media_type === 'video' && (
              <View style={styles.videoOverlay}>
                <View style={styles.playButton}>
                  <Ionicons name="play" size={24} color={colors.white} />
                </View>
              </View>
            )}
            {isSending && (
              <View style={styles.mediaUploading}>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={styles.uploadingText}>Envoi…</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Text content */}
        {hasText && (
          <Text style={[
            styles.messageText,
            isOwn ? styles.messageTextOwn : styles.messageTextOther,
          ]}>
            {message.content}
          </Text>
        )}

        {/* Footer: time + status */}
        <View style={styles.footer}>
          <Text style={[
            styles.timeText,
            isOwn ? styles.timeTextOwn : styles.timeTextOther,
          ]}>
            {formatTime(message.created_at)}
          </Text>
          {isOwn && (
            <View style={styles.statusWrap}>
              {isSending ? (
                <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.6)" />
              ) : hasError ? (
                <Ionicons name="alert-circle" size={12} color="#FCA5A5" />
              ) : (
                <Ionicons name="checkmark-done" size={12} color="rgba(255,255,255,0.7)" />
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default memo(ChatBubble);

const styles = StyleSheet.create({
  container: {
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  containerRight: {
    alignItems: 'flex-end',
  },
  containerLeft: {
    alignItems: 'flex-start',
  },

  // Sender info
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    marginLeft: 4,
  },
  senderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
  },
  roleBadge: {
    fontSize: 10,
    color: colors.textMuted,
    marginLeft: 6,
    fontWeight: '500',
  },

  // Bubble
  bubble: {
    maxWidth: MAX_BUBBLE_WIDTH,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  bubbleOwn: {
    backgroundColor: colors.blue,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleOrganizer: {
    backgroundColor: '#EFF6FF',
    borderColor: colors.blueBorder,
  },
  bubbleMedia: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },

  // Media
  mediaWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 4,
  },
  mediaImage: {
    width: MAX_BUBBLE_WIDTH - 8,
    height: 180,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 14,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaUploading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
  },
  uploadingText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  // Text
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  messageTextOwn: {
    color: colors.white,
  },
  messageTextOther: {
    color: colors.text,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 3,
    gap: 4,
  },
  timeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  timeTextOwn: {
    color: 'rgba(255,255,255,0.6)',
  },
  timeTextOther: {
    color: colors.textMuted,
  },
  statusWrap: {
    marginLeft: 2,
  },
});
