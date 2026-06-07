import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

function StatCard({ icon, label, value, hint, accentColor }) {
  return (
    <View style={[styles.statCard, { borderTopColor: accentColor, borderTopWidth: 3 }]}>
      <View style={[styles.statIcon, { backgroundColor: accentColor + '18' }]}>
        <Ionicons name={icon} size={20} color={accentColor} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accentColor }]}>{value}</Text>
      {hint && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

function ActionRow({ icon, label, color, onPress, rightElement }) {
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.actionIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      {rightElement || <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}

export default function OrganizerDashboard({ user, profile, refreshing, onRefreshComplete, onNavigate }) {
  const [stats, setStats] = useState({
    activeEvents: 0, ticketsSold: 0,
    revenue: { MGA: 0, EUR: 0, USD: 0 }, approvedEventsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [hideNotif, setHideNotif] = useState(false);
  const [requestingScan, setRequestingScan] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('tapakeel_hide_balance').then(v => {
      if (v === 'false') setBalanceHidden(false);
    });
  }, []);

  const toggleBalanceVisibility = async () => {
    const next = !balanceHidden;
    setBalanceHidden(next);
    await AsyncStorage.setItem('tapakeel_hide_balance', String(next));
  };

  const fetchStats = useCallback(async () => {
    try {
      const { data: events } = await supabase.from('events').select('id, status').eq('organizer_id', user.id);
      if (!events || events.length === 0) { setLoading(false); if (onRefreshComplete) onRefreshComplete(); return; }

      const eventIds = events.map(e => e.id);
      const activeCount = events.filter(e => e.status === 'published').length;
      const approvedCount = events.filter(e => e.status === 'approved').length;

      const { data: ticketTypes } = await supabase.from('ticket_types').select('quantity_sold').in('event_id', eventIds);
      const soldCount = ticketTypes?.reduce((s, t) => s + (t.quantity_sold || 0), 0) || 0;

      const { data: orders } = await supabase.from('orders').select('organizer_amount, currency').in('event_id', eventIds).eq('status', 'paid');
      const { data: pastPayouts } = await supabase.from('payouts').select('amount, currency').eq('organizer_id', user.id).neq('status', 'rejected');

      const rev = { MGA: 0, EUR: 0, USD: 0 };
      orders?.forEach(o => { const c = o.currency || 'MGA'; rev[c] = (rev[c] || 0) + Number(o.organizer_amount); });
      pastPayouts?.forEach(p => { const c = p.currency || 'MGA'; rev[c] = (rev[c] || 0) - Number(p.amount); });

      setStats({ activeEvents: activeCount, ticketsSold: soldCount, revenue: rev, approvedEventsCount: approvedCount });
    } catch (e) { console.error(e); }
    finally { setLoading(false); if (onRefreshComplete) onRefreshComplete(); }
  }, [user, onRefreshComplete]);

  useEffect(() => { if (user) fetchStats(); }, [user, fetchStats]);
  useEffect(() => { if (refreshing) { setLoading(true); fetchStats(); } }, [refreshing, fetchStats]);

  const handleScanRequest = async () => {
    setRequestingScan(true);
    try {
      await supabase.functions.invoke('send-admin-email', {
        body: {
          type: 'scanner_request',
          payload: {
            organizerName: profile?.business_name || profile?.full_name || 'Organisateur',
            organizerId: user.id,
          },
        },
      });
      Alert.alert('Succès', "Demande d'accès au scanner envoyée.");
    } catch (_) {
      Alert.alert('Erreur', "Impossible d'envoyer la demande.");
    } finally {
      setRequestingScan(false);
    }
  };

  const revenueText = () => {
    const r = stats.revenue;
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
      {/* Notification banner */}
      {!loading && stats.approvedEventsCount > 0 && !hideNotif && (
        <View style={styles.notifBanner}>
          <View style={styles.notifLeft}>
            <Ionicons name="checkmark-circle" size={18} color={colors.green} style={{ marginRight: 8 }} />
            <Text style={styles.notifText}>
              {stats.approvedEventsCount} événement(s) validé(s) ! Créez maintenant vos billets.
            </Text>
          </View>
          <TouchableOpacity onPress={() => setHideNotif(true)}>
            <Ionicons name="close" size={18} color={colors.green} />
          </TouchableOpacity>
        </View>
      )}

      {/* Stats */}
      <Text style={styles.sectionHeader}>Vos statistiques</Text>
      <View style={styles.statsGrid}>
        <StatCard icon="calendar-outline" label="Événements publiés" value={String(stats.activeEvents)}
          hint={`${stats.approvedEventsCount} en attente de billets`} accentColor={colors.blue} />
        <StatCard icon="ticket-outline" label="Billets vendus" value={String(stats.ticketsSold)}
          hint="Au total" accentColor={colors.green} />
        <View style={[styles.statCard, styles.fullWidth, { borderTopColor: colors.yellow, borderTopWidth: 3 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={[styles.statIcon, { backgroundColor: colors.yellow + '18' }]}>
              <Ionicons name="wallet-outline" size={20} color={colors.yellow} />
            </View>
            <TouchableOpacity onPress={toggleBalanceVisibility} style={{ padding: 6 }}>
              <Ionicons name={balanceHidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.statLabel}>Solde disponible</Text>
          <Text style={[styles.statValue, { color: colors.yellow }]}>
            {balanceHidden ? '••••••' : revenueText()}
          </Text>
          <Text style={styles.statHint}>Prêt à être retiré</Text>
        </View>
      </View>

      {/* Quick actions */}
      <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Actions rapides</Text>
      <View style={styles.actionsCard}>
        <ActionRow icon="calendar-outline" label="Mes événements" color={colors.blue}
          onPress={() => onNavigate && onNavigate('events')}
          rightElement={
            stats.approvedEventsCount > 0 ? (
              <View style={styles.badge}><Text style={styles.badgeText}>{stats.approvedEventsCount}</Text></View>
            ) : null
          }
        />
        <View style={styles.divider} />
        <ActionRow icon="wallet-outline" label="Trésorerie & Retraits" color={colors.yellow}
          onPress={() => onNavigate && onNavigate('payouts')}
        />
        <View style={styles.divider} />
        <ActionRow icon="people-outline" label="Gérer mon Staff" color="#7C3AED"
          onPress={() => onNavigate && onNavigate('staff')}
        />
        <View style={styles.divider} />
        <ActionRow icon="chatbubbles-outline" label="Chat Staff" color="#0EA5E9"
          onPress={() => onNavigate && onNavigate('chat')}
        />
        <View style={styles.divider} />
        <ActionRow icon="shield-checkmark-outline" label="Sécurité (PIN / Biométrie)" color={colors.blue}
          onPress={() => onNavigate && onNavigate('security')}
        />
        <View style={styles.divider} />
        {profile?.scan_authorized ? (
          <View style={styles.scanAuthorized}>
            <Ionicons name="scan-circle" size={20} color={colors.green} style={{ marginRight: 10 }} />
            <View>
              <Text style={styles.scanAuthText}>Accès scanner activé</Text>
              <Text style={styles.scanAuthHint}>Utilisez l'onglet Scanner</Text>
            </View>
            <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>Actif</Text></View>
          </View>
        ) : (
          <TouchableOpacity style={styles.actionRow} onPress={handleScanRequest} disabled={requestingScan}>
            <View style={[styles.actionIcon, { backgroundColor: colors.yellow + '18' }]}>
              {requestingScan ? (
                <ActivityIndicator size="small" color={colors.yellow} />
              ) : (
                <Ionicons name="camera-outline" size={18} color={colors.yellow} />
              )}
            </View>
            <Text style={styles.actionLabel}>
              {requestingScan ? 'Envoi en cours…' : "Demander l'accès au scanner"}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { padding: 40, alignItems: 'center' },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },

  notifBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.greenPale, borderWidth: 1, borderColor: colors.greenBorder,
    borderRadius: 12, padding: 12, marginBottom: 20,
  },
  notifLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  notifText: { color: colors.green, fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    width: '47.5%', backgroundColor: colors.surface, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  fullWidth: { width: '100%' },
  statIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  statHint: { fontSize: 10, color: colors.textMuted, marginTop: 3 },

  actionsCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  actionRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  actionIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 14 },

  badge: { backgroundColor: colors.green, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginRight: 8 },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },

  scanAuthorized: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  scanAuthText: { fontSize: 14, fontWeight: '600', color: colors.green },
  scanAuthHint: { fontSize: 12, color: colors.textMuted },
  activeBadge: {
    marginLeft: 'auto', backgroundColor: colors.greenPale, borderWidth: 1,
    borderColor: colors.greenBorder, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  activeBadgeText: { color: colors.green, fontSize: 11, fontWeight: '700' },
});
