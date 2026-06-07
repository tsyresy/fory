// Admin Dashboard — Stats overview + quick nav to all sections
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, hint, accentColor, badgeCount, delay = 0, eyeToggle, balanceHidden }) {
  const opacity = useSharedValue(0);
  const y = useSharedValue(16);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) }));
    y.value = withDelay(delay, withTiming(0, { duration: 350, easing: Easing.out(Easing.quad) }));
  }, []);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));

  return (
    <Animated.View style={[styles.statCard, anim]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={[styles.statIconBox, { backgroundColor: accentColor + '20' }]}>
          <Ionicons name={icon} size={22} color={accentColor} />
        </View>
        {eyeToggle && (
          <TouchableOpacity onPress={eyeToggle} style={{ padding: 6 }}>
            <Ionicons name={balanceHidden ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accentColor }]}>{value}</Text>
      {hint && <Text style={styles.statHint}>{hint}</Text>}
      {badgeCount > 0 && (
        <View style={[styles.statBadge, { backgroundColor: accentColor }]}>
          <Text style={styles.statBadgeText}>{badgeCount}</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Section Button ───────────────────────────────────────────────────────────
function SectionButton({ icon, title, subtitle, color, badge, onPress }) {
  return (
    <TouchableOpacity style={styles.sectionBtn} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.sectionIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.sectionTextWrap}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {badge > 0 && (
        <View style={[styles.sectionBadge, { backgroundColor: color }]}>
          <Text style={styles.sectionBadgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AdminDashboard({ refreshing, onRefreshComplete, onNavigate }) {
  const [stats, setStats] = useState({
    totalUsers: 0, totalEvents: 0,
    platformRevenue: { MGA: 0, EUR: 0, USD: 0 },
    pendingPayoutsCount: 0, pendingEventsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [balanceHidden, setBalanceHidden] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('tapakeel_hide_balance').then(v => {
      if (v === 'true') setBalanceHidden(true);
    });
  }, []);

  const toggleBalanceVisibility = async () => {
    const next = !balanceHidden;
    setBalanceHidden(next);
    await AsyncStorage.setItem('tapakeel_hide_balance', String(next));
  };

  const fetchStats = useCallback(async () => {
    try {
      const [
        { count: usersCount },
        { count: eventsCount },
        { data: orders },
        { count: payoutsCount },
        { count: pendingEventsCount },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('events').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('commission_amount, currency').eq('status', 'paid'),
        supabase.from('payouts').select('*', { count: 'exact', head: true }).eq('status', 'requested'),
        supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);

      const revenue = { MGA: 0, EUR: 0, USD: 0 };
      orders?.forEach(o => { const c = o.currency || 'MGA'; revenue[c] = (revenue[c] || 0) + Number(o.commission_amount); });

      setStats({
        totalUsers: usersCount || 0, totalEvents: eventsCount || 0,
        platformRevenue: revenue, pendingPayoutsCount: payoutsCount || 0, pendingEventsCount: pendingEventsCount || 0,
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); if (onRefreshComplete) onRefreshComplete(); }
  }, [onRefreshComplete]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { if (refreshing) { setLoading(true); fetchStats(); } }, [refreshing, fetchStats]);

  const revenueText = () => {
    const r = stats.platformRevenue;
    const parts = [];
    if (r.MGA > 0) parts.push(`${r.MGA.toLocaleString('fr-FR')} MGA`);
    if (r.EUR > 0) parts.push(`${r.EUR.toLocaleString('fr-FR')} EUR`);
    if (r.USD > 0) parts.push(`${r.USD.toLocaleString('fr-FR')} USD`);
    return parts.length > 0 ? parts.join('\n') : '0 MGA';
  };

  if (loading && !refreshing) {
    return <View style={styles.loader}><ActivityIndicator size="large" color={colors.blue} /></View>;
  }

  return (
    <View>
      {/* Admin banner */}
      <View style={styles.adminBanner}>
        <Ionicons name="shield-checkmark" size={15} color={colors.white} style={{ marginRight: 6 }} />
        <Text style={styles.adminBannerText}>Administration Tapakeel</Text>
      </View>

      {/* Stats grid */}
      <Text style={styles.sectionHeader}>Vue d'ensemble</Text>
      <View style={styles.statsGrid}>
        <StatCard icon="wallet-outline" label="Revenus plateforme" value={balanceHidden ? '••••••' : revenueText()} hint="Commission 5%" accentColor={colors.blue} delay={0} eyeToggle={toggleBalanceVisibility} balanceHidden={balanceHidden} />
        <StatCard icon="time-outline" label="Retraits en attente" value={String(stats.pendingPayoutsCount)} hint="À traiter" accentColor={colors.yellow} delay={80} />
        <StatCard icon="people-outline" label="Utilisateurs" value={String(stats.totalUsers)} hint="Inscrits" accentColor={colors.green} delay={160} />
        <StatCard icon="calendar-outline" label="Événements" value={String(stats.totalEvents)} hint={`${stats.pendingEventsCount} en attente`} accentColor={colors.blue} badgeCount={stats.pendingEventsCount} delay={240} />
      </View>

      {/* Quick access sections */}
      <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Outils d'administration</Text>
      <View style={styles.sectionsCard}>
        <SectionButton
          icon="calendar-outline" title="Validation Événements"
          subtitle="Approuver ou refuser les événements"
          color={colors.blue} badge={stats.pendingEventsCount}
          onPress={() => onNavigate && onNavigate('events')}
        />
        <View style={styles.divider} />
        <SectionButton
          icon="cash-outline" title="Gestion des Retraits"
          subtitle="Traiter les demandes de virement"
          color={colors.yellow} badge={stats.pendingPayoutsCount}
          onPress={() => onNavigate && onNavigate('payouts')}
        />
        <View style={styles.divider} />
        <SectionButton
          icon="people-outline" title="Gestion des Utilisateurs"
          subtitle="Modérer et gérer les accès scanner"
          color={colors.green} badge={0}
          onPress={() => onNavigate && onNavigate('users')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { padding: 40, alignItems: 'center' },
  adminBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.blue, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20,
  },
  adminBannerText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    width: '47.5%', backgroundColor: colors.surface, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border, position: 'relative',
  },
  statIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  statHint: { fontSize: 10, color: colors.textMuted, marginTop: 3 },
  statBadge: {
    position: 'absolute', top: 10, right: 10,
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: 'center',
  },
  statBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },

  // Sections
  sectionsCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  sectionBtn: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  sectionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sectionTextWrap: { flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 },
  sectionSubtitle: { fontSize: 12, color: colors.textMuted },
  sectionBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginRight: 8, minWidth: 22, alignItems: 'center' },
  sectionBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 14 },
});
