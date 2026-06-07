import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// ─── EAS Project ID (from eas init --id) ──────────────────────────────────────
const EAS_PROJECT_ID = '502e97d1-9ff9-4f10-95f9-ff323dad4543';

// ─── Configure notification behavior ──────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Register for push notifications ──────────────────────────────────────────
export async function registerForPushNotifications() {
  let token = null;

  // Must be a physical device
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Android: set up notification channels first
  if (Platform.OS === 'android') {
    await setupAndroidChannels();
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permissions if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  try {
    // Get Expo push token — use EAS projectId from config or hardcoded fallback
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId ||
      EAS_PROJECT_ID;

    console.log('Requesting push token with projectId:', projectId);

    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = pushToken.data;
    console.log('✅ Push token obtained:', token);
  } catch (error) {
    // In Expo Go (SDK 53+), remote push is not supported — graceful fallback
    const isExpoGo = Constants.appOwnership === 'expo';
    if (isExpoGo) {
      console.log(
        'ℹ️ Running in Expo Go — remote push notifications unavailable (SDK 53+). ' +
        'Local notifications still work. Use the development build for full push support.'
      );
    } else {
      console.warn('Push token registration failed:', error.message || error);
    }
    return null;
  }

  return token;
}

// ─── Setup Android notification channels ──────────────────────────────────────
async function setupAndroidChannels() {
  await Notifications.setNotificationChannelAsync('chat', {
    name: 'Messages du chat',
    description: 'Notifications pour les nouveaux messages dans les discussions d\'événements',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#224798',
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Général',
    description: 'Notifications générales de l\'application',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// ─── Save push token to Supabase ──────────────────────────────────────────────
export async function savePushToken(userId, token) {
  if (!userId || !token) return;

  try {
    // Upsert the token in the profiles table (or a dedicated push_tokens table)
    await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', userId);
    
    console.log('Push token saved for user:', userId);
  } catch (error) {
    console.error('Error saving push token:', error);
  }
}

// ─── Send local notification (for foreground) ─────────────────────────────────
export async function sendLocalChatNotification(senderName, content, eventTitle, mediaType) {
  let body = content;
  if (mediaType === 'image') body = '📷 Photo';
  if (mediaType === 'video') body = '🎬 Vidéo';

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `💬 ${eventTitle}`,
      subtitle: senderName,
      body: body || 'Nouveau message',
      sound: 'default',
      data: { type: 'chat_message', eventTitle },
      ...(Platform.OS === 'android' ? { channelId: 'chat' } : {}),
    },
    trigger: null, // Immediate
  });
}

// ─── Add notification response listener ───────────────────────────────────────
export function addNotificationResponseListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

// ─── Add notification received listener ───────────────────────────────────────
export function addNotificationReceivedListener(callback) {
  return Notifications.addNotificationReceivedListener(callback);
}

// ─── Get badge count ──────────────────────────────────────────────────────────
export async function setBadgeCount(count) {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (_) {}
}
