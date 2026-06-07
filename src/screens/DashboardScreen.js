import React, { useState, useEffect } from 'react';
import {
  ScrollView, RefreshControl, StyleSheet, Text, View,
  TouchableOpacity, Platform,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { globalStyles } from '../theme/styles';
import { colors } from '../theme/colors';

// Admin
import AdminDashboard from './dashboards/AdminDashboard';
import AdminEventsScreen from './dashboards/admin/AdminEventsScreen';
import AdminUsersScreen from './dashboards/admin/AdminUsersScreen';
import AdminPayoutsScreen from './dashboards/admin/AdminPayoutsScreen';
import AdminChatsScreen from './dashboards/admin/AdminChatsScreen';

// Organizer
import OrganizerDashboard from './dashboards/OrganizerDashboard';
import OrganizerEventsScreen from './dashboards/organizer/OrganizerEventsScreen';
import OrganizerPayoutsScreen from './dashboards/organizer/OrganizerPayoutsScreen';
import OrganizerStaffScreen from './dashboards/organizer/OrganizerStaffScreen';
import OrganizerSecurityScreen from './dashboards/organizer/OrganizerSecurityScreen';
import ChatListScreen from './chat/ChatListScreen';

// ─── Section Header for sub-pages ─────────────────────────────────────────────
function SectionHeader({ title, onBack }) {
  return (
    <View style={styles.sectionHeader}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={20} color={colors.blue} />
      </TouchableOpacity>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
    </View>
  );
}

// ─── Admin Tab Bar ─────────────────────────────────────────────────────────────
const ADMIN_SECTIONS = [
  { key: 'home', label: 'Accueil', icon: 'home-outline' },
  { key: 'events', label: 'Événements', icon: 'calendar-outline' },
  { key: 'chats', label: 'Chats', icon: 'chatbubbles-outline' },
  { key: 'payouts', label: 'Retraits', icon: 'cash-outline' },
  { key: 'users', label: 'Utilisateurs', icon: 'people-outline' },
];

const ORGANIZER_SECTIONS = [
  { key: 'home', label: 'Accueil', icon: 'home-outline' },
  { key: 'events', label: 'Mes Événements', icon: 'calendar-outline' },
  { key: 'staff', label: 'Mon Staff', icon: 'people-outline' },
  { key: 'chat', label: 'Chat Staff', icon: 'chatbubbles-outline' },
  { key: 'payouts', label: 'Trésorerie', icon: 'wallet-outline' },
  { key: 'security', label: 'Sécurité', icon: 'shield-checkmark-outline' },
];

function SectionTabBar({ sections, activeSection, onSelect, badgeCounts = {} }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabBarContent}
      style={styles.tabBarScroll}
    >
      {sections.map(s => (
        <TouchableOpacity
          key={s.key}
          style={[styles.tabBtn, activeSection === s.key && styles.tabBtnActive]}
          onPress={() => onSelect(s.key)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeSection === s.key ? s.icon.replace('-outline', '') : s.icon}
            size={15}
            color={activeSection === s.key ? colors.white : colors.textSecondary}
            style={{ marginRight: 5 }}
          />
          <Text style={[styles.tabBtnText, activeSection === s.key && styles.tabBtnTextActive]}>
            {s.label}
          </Text>
          {badgeCounts[s.key] > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{badgeCounts[s.key]}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const { user, profile, signOut } = useAuthStore();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState('home');

  const isAdmin = profile?.role === 'admin';
  const isOrganizer = profile?.role === 'organizer';
  const sections = isAdmin ? ADMIN_SECTIONS : ORGANIZER_SECTIONS;

  // Fade-in
  const opacity = useSharedValue(0);
  useEffect(() => { opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) }); }, []);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const onRefresh = () => setRefreshing(true);
  const handleRefreshComplete = () => setRefreshing(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    signOut();
  };

  const getSectionTitle = () => {
    return sections.find(s => s.key === activeSection)?.label || 'Accueil';
  };

  const renderContent = () => {
    if (isAdmin) {
      switch (activeSection) {
        case 'events': return <AdminEventsScreen refreshing={refreshing} onRefreshComplete={handleRefreshComplete} />;
        case 'chats': return <AdminChatsScreen refreshing={refreshing} onRefreshComplete={handleRefreshComplete} />;
        case 'payouts': return <AdminPayoutsScreen refreshing={refreshing} onRefreshComplete={handleRefreshComplete} />;
        case 'users': return <AdminUsersScreen refreshing={refreshing} onRefreshComplete={handleRefreshComplete} />;
        default: return (
          <AdminDashboard
            refreshing={refreshing}
            onRefreshComplete={handleRefreshComplete}
            onNavigate={setActiveSection}
          />
        );
      }
    }
    if (isOrganizer) {
      switch (activeSection) {
        case 'events': return <OrganizerEventsScreen user={user} refreshing={refreshing} onRefreshComplete={handleRefreshComplete} />;
        case 'staff': return <OrganizerStaffScreen user={user} refreshing={refreshing} onRefreshComplete={handleRefreshComplete} />;
        case 'chat': return <ChatListScreen userId={user?.id} onSelectEvent={() => navigation.navigate('Chat')} />;
        case 'payouts': return <OrganizerPayoutsScreen user={user} profile={profile} refreshing={refreshing} onRefreshComplete={handleRefreshComplete} />;
        case 'security': return <OrganizerSecurityScreen user={user} profile={profile} refreshing={refreshing} onRefreshComplete={handleRefreshComplete} />;
        default: return (
          <OrganizerDashboard
            user={user}
            profile={profile}
            refreshing={refreshing}
            onRefreshComplete={handleRefreshComplete}
            onNavigate={setActiveSection}
          />
        );
      }
    }
    return (
      <View style={styles.noRoleWrap}>
        <Ionicons name="person-outline" size={40} color={colors.textMuted} />
        <Text style={styles.noRoleText}>Aucun tableau de bord disponible.</Text>
      </View>
    );
  };

  return (
    <View style={[globalStyles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={colors.gradientHeader}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreeting}>Bonjour 👋</Text>
            <Text style={styles.headerName} numberOfLines={1}>
              {profile?.business_name || profile?.full_name || 'Utilisateur'}
            </Text>
          </View>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>

        {/* Section Tab Bar */}
        <SectionTabBar
          sections={sections}
          activeSection={activeSection}
          onSelect={setActiveSection}
        />
      </LinearGradient>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.blue}
            colors={[colors.blue]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={fadeStyle}>
          {renderContent()}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 0,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  headerTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 16,
  },
  headerGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginBottom: 3 },
  headerName: { fontSize: 20, fontWeight: '700', color: colors.white, letterSpacing: -0.3, maxWidth: 240 },
  signOutBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Tab bar
  tabBarScroll: { marginHorizontal: -20 },
  tabBarContent: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)',
  },
  tabBtnActive: { backgroundColor: colors.white },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  tabBtnTextActive: { color: colors.blue },
  tabBadge: {
    marginLeft: 5, backgroundColor: colors.yellow,
    borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: 'center',
  },
  tabBadgeText: { fontSize: 9, fontWeight: '700', color: colors.white },

  // Section Header
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, marginBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  sectionHeaderTitle: { fontSize: 17, fontWeight: '700', color: colors.text },

  // Content
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },

  noRoleWrap: { alignItems: 'center', padding: 48, gap: 12 },
  noRoleText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
});
