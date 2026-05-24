import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { supabase } from './src/lib/supabase';
import { useAuthStore } from './src/store/authStore';
import { colors } from './src/theme/colors';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ScanModeScreen from './src/screens/ScanModeScreen';

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

// Organizer tabs: Accueil + Scanner
function OrganizerTabNavigator() {
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

export default function App() {
  const { user, profile, setUser, setProfile } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setProfile(data);
  };

  // Choose the right navigator based on role
  const getMainNavigator = () => {
    if (profile?.role === 'admin') return AdminTabNavigator;
    return OrganizerTabNavigator;
  };

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
});
