import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { StatusBar } from 'expo-status-bar';
import { supabase } from './src/lib/supabase';
import { useAuthStore } from './src/store/authStore';
import { useChatStore } from './src/store/chatStore';
import { colors } from './src/theme/colors';
import {
  registerForPushNotifications,
  savePushToken,
  addNotificationResponseListener,
  setBadgeCount,
} from './src/lib/notifications';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ScanModeScreen from './src/screens/ScanModeScreen';
import StaffDashboardScreen from './src/screens/StaffDashboardScreen';
import ChatScreen from './src/screens/ChatScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Hook-based tab bar style to properly respect Android bottom inset
function useTabBarStyle() {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'ios') {
    return {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      height: 84,
      paddingBottom: 24,
      paddingTop: 8,
      elevation: 8,
    };
  }
  // Android: add system bottom inset (navigation bar height) to avoid overlap
  const bottomInset = insets.bottom ?? 0;
  return {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: 56 + bottomInset,
    paddingBottom: bottomInset > 0 ? bottomInset : 8,
    paddingTop: 8,
    elevation: 8,
  };
}

// Admin tabs: Accueil + Scanner
function AdminTabNavigator() {
  const tabBarStyle = useTabBarStyle();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            'Accueil': focused ? 'home' : 'home-outline',
            'Scanner': focused ? 'scan-circle' : 'scan-outline',
          };
          return <Ionicons name={icons[route.name] || 'apps'} size={focused ? size + 1 : size} color={color} />;
        },
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: tabBarStyle,
        tabBarHideOnKeyboard: true,
      })}
      screenListeners={{ tabPress: () => Haptics.selectionAsync() }}
    >
      <Tab.Screen name="Accueil" component={DashboardScreen} options={{ tabBarLabel: 'Accueil' }} />
      <Tab.Screen name="Scanner" component={ScanModeScreen} options={{ tabBarLabel: 'Scanner' }} />
    </Tab.Navigator>
  );
}

// Organizer tabs: Accueil + Chat + Scanner
function OrganizerTabNavigator() {
  const tabBarStyle = useTabBarStyle();
  const totalUnread = useChatStore(state => state.totalUnread);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            'Accueil': focused ? 'home' : 'home-outline',
            'Chat': focused ? 'chatbubbles' : 'chatbubbles-outline',
            'Scanner': focused ? 'scan-circle' : 'scan-outline',
          };
          return <Ionicons name={icons[route.name] || 'apps'} size={focused ? size + 1 : size} color={color} />;
        },
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: tabBarStyle,
        tabBarHideOnKeyboard: true,
      })}
      screenListeners={{ tabPress: () => Haptics.selectionAsync() }}
    >
      <Tab.Screen name="Accueil" component={DashboardScreen} options={{ tabBarLabel: 'Accueil' }} />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarLabel: 'Chat',
          tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.red, fontSize: 10, fontWeight: '700' },
        }}
      />
      <Tab.Screen name="Scanner" component={ScanModeScreen} options={{ tabBarLabel: 'Scanner' }} />
    </Tab.Navigator>
  );
}

// Staff tabs: Accueil (simplified) + Chat + Scanner
function StaffTabNavigator() {
  const tabBarStyle = useTabBarStyle();
  const totalUnread = useChatStore(state => state.totalUnread);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            'Accueil': focused ? 'home' : 'home-outline',
            'Chat': focused ? 'chatbubbles' : 'chatbubbles-outline',
            'Scanner': focused ? 'scan-circle' : 'scan-outline',
          };
          return <Ionicons name={icons[route.name] || 'apps'} size={focused ? size + 1 : size} color={color} />;
        },
        tabBarActiveTintColor: '#7C3AED',
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: tabBarStyle,
        tabBarHideOnKeyboard: true,
      })}
      screenListeners={{ tabPress: () => Haptics.selectionAsync() }}
    >
      <Tab.Screen name="Accueil" component={StaffDashboardScreen} options={{ tabBarLabel: 'Accueil' }} />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarLabel: 'Chat',
          tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#7C3AED', fontSize: 10, fontWeight: '700' },
        }}
      />
      <Tab.Screen name="Scanner" component={ScanModeScreen} options={{ tabBarLabel: 'Scanner' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const { user, profile, isStaff, setUser, setProfile } = useAuthStore();
  const [biometricLocked, setBiometricLocked] = useState(true);
  const [biometricChecking, setBiometricChecking] = useState(true);
  const [biometricType, setBiometricType] = useState(null); // 'face' | 'fingerprint' | null

  // ─── Push notifications setup ─────────────────────────────────────
  useEffect(() => {
    if (!user || !profile) return;

    const setupPush = async () => {
      const token = await registerForPushNotifications();
      if (token) {
        await savePushToken(user.id, token);
      }
    };

    setupPush();

    // Listen for notification taps (e.g. navigate to chat)
    const responseListener = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'chat_message') {
        // User tapped a chat notification — the Chat tab will handle navigation
        console.log('Notification tapped: chat_message', data);
      }
    });

    return () => {
      if (responseListener) responseListener.remove();
    };
  }, [user, profile]);

  // ─── Sync badge count with unread messages ────────────────────────
  useEffect(() => {
    const totalUnread = useChatStore.getState().totalUnread;
    setBadgeCount(totalUnread);
  });

  // Subscribe to totalUnread changes
  useEffect(() => {
    const unsub = useChatStore.subscribe(
      (state) => state.totalUnread,
      (totalUnread) => {
        setBadgeCount(totalUnread);
      }
    );
    return unsub;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn('Session recovery failed, signing out:', error.message);
        supabase.auth.signOut().catch(() => {});
        setUser(null);
        setProfile(null);
        return;
      }
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        setUser(null);
        setProfile(null);
        return;
      }
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Check biometric lock when profile loads
  useEffect(() => {
    const checkBiometric = async () => {
      if (!profile || !profile.biometric_enabled) {
        setBiometricLocked(false);
        setBiometricChecking(false);
        return;
      }

      // Check if device supports biometrics
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (!compatible || !enrolled) {
        // Device doesn't support biometrics — skip lock
        setBiometricLocked(false);
        setBiometricChecking(false);
        return;
      }

      // Detect biometric type (Face ID vs Fingerprint)
      try {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('face');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('fingerprint');
        }
      } catch (_) {}

      setBiometricChecking(false);
      // Start biometric authentication
      authenticateBiometric();
    };
    
    if (user && profile) {
      checkBiometric();
    } else {
      setBiometricLocked(false);
      setBiometricChecking(false);
    }
  }, [profile, user]);

  const authenticateBiometric = async () => {
    try {
      if (Platform.OS === 'ios') {
        // iOS: Try Face ID / Touch ID first, then auto-fallback to passcode
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Déverrouillez Tapakeel',
          cancelLabel: 'Annuler',
          fallbackLabel: 'Utiliser le code',
          disableDeviceFallback: false,
        });
        if (result.success) {
          setBiometricLocked(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        // Android: Fingerprint only, with device credential fallback
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Déverrouillez Tapakeel',
          cancelLabel: 'Annuler',
          disableDeviceFallback: false,
        });
        if (result.success) {
          setBiometricLocked(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (e) {
      console.error('Biometric auth error:', e);
    }
  };

  const fetchProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setProfile(data);
  };

  // Choose the right navigator based on role or staff mode
  const getMainNavigator = () => {
    if (isStaff) return StaffTabNavigator;
    if (profile?.role === 'admin') return AdminTabNavigator;
    return OrganizerTabNavigator;
  };

  // Biometric lock screen
  if (user && profile?.biometric_enabled && biometricLocked && !biometricChecking) {
    const isFace = biometricType === 'face';
    const biometricIcon = isFace ? 'scan-outline' : 'finger-print';
    const biometricLabel = isFace ? 'Face ID' : (Platform.OS === 'ios' ? 'Touch ID' : 'empreinte digitale');

    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <StatusBar style="dark" backgroundColor={colors.surface} />
          <View style={styles.lockScreen}>
            <View style={styles.lockCard}>
              <View style={styles.lockIconWrap}>
                <Ionicons name={biometricIcon} size={56} color={colors.blue} />
              </View>
              <Text style={styles.lockTitle}>Tapakeel est verrouillé</Text>
              <Text style={styles.lockSubtitle}>
                {Platform.OS === 'ios'
                  ? `Utilisez ${biometricLabel} pour déverrouiller l'application, ou votre code d'accès si ${biometricLabel} échoue.`
                  : `Utilisez votre ${biometricLabel} pour déverrouiller l'application.`
                }
              </Text>
              <TouchableOpacity style={styles.lockBtn} onPress={authenticateBiometric} activeOpacity={0.7}>
                <Ionicons name={biometricIcon} size={20} color={colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.lockBtnText}>Déverrouiller</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.surface} />
        {/* No custom theme prop — avoids fonts.regular crash in RN v7 */}
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            {user ? (
              <Stack.Screen
                name="MainTabs"
                component={getMainNavigator()}
              />
            ) : (
              <Stack.Screen
                name="Login"
                component={LoginScreen}
                options={{ animation: 'fade' }}
              />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  lockScreen: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.background, padding: 24,
  },
  lockCard: {
    backgroundColor: colors.surface, borderRadius: 24, padding: 32,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    maxWidth: 340, width: '100%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 24 },
      android: { elevation: 6 },
    }),
  },
  lockIconWrap: {
    width: 96, height: 96, borderRadius: 28,
    backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  lockTitle: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 8, textAlign: 'center' },
  lockSubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  lockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.blue, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28,
    width: '100%',
  },
  lockBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
});
