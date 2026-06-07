import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, ScrollView, RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';

export default function StaffDashboardScreen() {
  const { user, profile, staffEventId, staffEventTitle, signOut } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ scansCount: 0, validScans: 0, status: 'active' });
  const [eventInfo, setEventInfo] = useState(null);

  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) });
  }, []);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const fetchData = useCallback(async () => {
    try {
      const { data: staffEntry } = await supabase
        .from('event_staff').select('status')
        .eq('event_id', staffEventId).eq('user_id', user.id).single();

      const { data: event } = await supabase
        .from('events').select('id, title, date, location, status')
        .eq('id', staffEventId).single();

      const { count: scansCount } = await supabase
        .from('ticket_scans').select('id', { count: 'exact', head: true })
        .eq('scanned_by', user.id);

      const { data: scans } = await supabase
        .from('ticket_scans').select('id, result')
        .eq('scanned_by', user.id);

      setStats({
        scansCount: scansCount || 0,
        validScans: scans?.filter(s => s.result === 'granted').length || 0,
        status: staffEntry?.status || 'unknown',
      });
      setEventInfo(event);
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }, [staffEventId, user]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (refreshing) fetchData(); }, [refreshing, fetchData]);

  const handleSignOut = async () => { await supabase.auth.signOut(); signOut(); };

  const formatDate = (d) => {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return d; }
  };

  if (loading) {
    return (
      <View style={[styles.fill, styles.centered]}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>Chargement…</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <LinearGradient colors={['#7C3AED', '#A855F7']} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.staffBadge}>
              <Ionicons name="people" size={12} color="#7C3AED" />
              <Text style={styles.staffBadgeLabel}>STAFF</Text>
            </View>
            <Text style={styles.headerGreeting}>Bonjour 👋</Text>
            <Text style={styles.headerName} numberOfLines={1}>
              {profile?.full_name || 'Staff'}
            </Text>
          </View>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} tintColor="#7C3AED" colors={['#7C3AED']} />}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={fadeStyle}>
          {stats.status === 'suspended' && (
            <View style={styles.suspendedBanner}>
              <Ionicons name="warning" size={20} color={colors.red} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.red }}>Accès suspendu</Text>
                <Text style={{ fontSize: 13, color: colors.red, opacity: 0.8, lineHeight: 18 }}>
                  L'organisateur a suspendu votre accès au scanner.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.eventCard}>
            <View style={styles.eventCardRow}>
              <View style={styles.eventIcon}>
                <Ionicons name="calendar" size={22} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventLabel}>Événement assigné</Text>
                <Text style={styles.eventTitle} numberOfLines={2}>{staffEventTitle || eventInfo?.title}</Text>
              </View>
              <View style={[styles.chip, { backgroundColor: stats.status === 'active' ? colors.greenPale : colors.redPale }]}>
                <View style={[styles.chipDot, { backgroundColor: stats.status === 'active' ? colors.green : colors.red }]} />
                <Text style={[styles.chipText, { color: stats.status === 'active' ? colors.green : colors.red }]}>
                  {stats.status === 'active' ? 'Actif' : 'Suspendu'}
                </Text>
              </View>
            </View>
            {eventInfo?.date && (
              <View style={styles.eventMeta}>
                <Ionicons name="time-outline" size={15} color={colors.textMuted} style={{ marginRight: 6 }} />
                <Text style={styles.metaText}>{formatDate(eventInfo.date)}</Text>
              </View>
            )}
            {eventInfo?.location && (
              <View style={[styles.eventMeta, { marginTop: 6 }]}>
                <Ionicons name="location-outline" size={15} color={colors.textMuted} style={{ marginRight: 6 }} />
                <Text style={styles.metaText} numberOfLines={1}>{eventInfo.location}</Text>
              </View>
            )}
          </View>

          <Text style={styles.section}>Vos statistiques</Text>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderTopColor: '#7C3AED' }]}>
              <View style={[styles.statIconBox, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="scan" size={20} color="#7C3AED" />
              </View>
              <Text style={styles.statLabel}>Total scans</Text>
              <Text style={[styles.statValue, { color: '#7C3AED' }]}>{stats.scansCount}</Text>
            </View>
            <View style={[styles.statCard, { borderTopColor: colors.green }]}>
              <View style={[styles.statIconBox, { backgroundColor: colors.greenPale }]}>
                <Ionicons name="checkmark-circle" size={20} color={colors.green} />
              </View>
              <Text style={styles.statLabel}>Billets validés</Text>
              <Text style={[styles.statValue, { color: colors.green }]}>{stats.validScans}</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color="#7C3AED" style={{ marginRight: 10 }} />
            <Text style={styles.infoText}>
              Utilisez l'onglet Scanner pour vérifier les billets de cet événement.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: 20, paddingBottom: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  staffBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start',
    marginBottom: 8, gap: 4,
  },
  staffBadgeLabel: { fontSize: 10, fontWeight: '800', color: '#7C3AED', letterSpacing: 0.5 },
  headerGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginBottom: 3 },
  headerName: { fontSize: 20, fontWeight: '700', color: colors.white, letterSpacing: -0.3, maxWidth: 240 },
  signOutBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20 },
  suspendedBanner: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.redPale,
    borderWidth: 1, borderColor: colors.redBorder, borderRadius: 14, padding: 14, marginBottom: 16,
  },
  eventCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 2 } }),
  },
  eventCardRow: { flexDirection: 'row', alignItems: 'center' },
  eventIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  eventLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  eventTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginLeft: 8 },
  chipDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  chipText: { fontSize: 11, fontWeight: '700' },
  eventMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  metaText: { fontSize: 13, color: colors.textSecondary },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, borderTopWidth: 3 },
  statIconBox: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E9D5FF' },
  infoText: { flex: 1, fontSize: 13, color: '#6D28D9', lineHeight: 19 },
});
