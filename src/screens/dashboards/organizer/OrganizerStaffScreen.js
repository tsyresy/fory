import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, Platform, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';

function StaffRow({ staff, onToggle }) {
  const isActive = staff.status === 'active';
  return (
    <View style={styles.staffRow}>
      <View style={[styles.avatar, { backgroundColor: isActive ? '#EDE9FE' : colors.redPale }]}>
        <Ionicons name="person" size={18} color={isActive ? '#7C3AED' : colors.red} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.staffName} numberOfLines={1}>
          {staff.staff_name || staff.profiles?.full_name || staff.staff_email || staff.profiles?.email || 'Utilisateur'}
        </Text>
        <Text style={styles.staffDate}>
          {staff.staff_email ? `${staff.staff_email} · ` : ''}Rejoint le {new Date(staff.joined_at).toLocaleDateString('fr-FR')}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.toggleBtn, isActive ? styles.toggleBtnSuspend : styles.toggleBtnActivate]}
        onPress={() => onToggle(staff)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isActive ? 'pause-circle' : 'play-circle'}
          size={14}
          color={isActive ? colors.red : colors.green}
          style={{ marginRight: 4 }}
        />
        <Text style={[styles.toggleText, { color: isActive ? colors.red : colors.green }]}>
          {isActive ? 'Suspendre' : 'Réactiver'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function OrganizerStaffScreen({ user, refreshing, onRefreshComplete }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      // Get organizer's events with their staff
      const { data: orgEvents } = await supabase
        .from('events')
        .select('id, title, staff_code, status, start_date, end_date')
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false });

      if (!orgEvents || orgEvents.length === 0) {
        setEvents([]);
        setLoading(false);
        if (onRefreshComplete) onRefreshComplete();
        return;
      }

      // For each event, fetch staffs then enrich with profile data
      const eventsWithStaff = await Promise.all(
        orgEvents.map(async (evt) => {
          const { data: staffList } = await supabase
            .from('event_staff')
            .select('id, user_id, status, joined_at, suspended_at, staff_name, staff_email')
            .eq('event_id', evt.id)
            .order('joined_at', { ascending: false });

          // Try to enrich with profile data (may fail due to RLS, but staff_name/staff_email are fallbacks)
          const enrichedStaff = await Promise.all(
            (staffList || []).map(async (staff) => {
              if (staff.staff_name) {
                // Already have name stored — no need to query profiles
                return { ...staff, profiles: { full_name: staff.staff_name, email: staff.staff_email } };
              }
              // Fallback: try to fetch from profiles
              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', staff.user_id)
                .single();
              return { ...staff, profiles: profile };
            })
          );

          return { ...evt, staffList: enrichedStaff };
        })
      );

      setEvents(eventsWithStaff);
    } catch (err) { console.error(err); }
    finally { setLoading(false); if (onRefreshComplete) onRefreshComplete(); }
  }, [user, onRefreshComplete]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (refreshing) { setLoading(true); fetchData(); } }, [refreshing, fetchData]);

  const handleCopyCode = async (code) => {
    try {
      await Clipboard.setStringAsync(code);
      Alert.alert('Copié !', `Le code ${code} a été copié dans le presse-papiers.`);
    } catch {
      Alert.alert('Code', code);
    }
  };

  const handleToggleStaff = async (staff, eventId) => {
    const newStatus = staff.status === 'active' ? 'suspended' : 'active';
    const action = newStatus === 'suspended' ? 'suspendre' : 'réactiver';

    Alert.alert(
      `${newStatus === 'suspended' ? 'Suspendre' : 'Réactiver'} ce staff ?`,
      `Voulez-vous ${action} l'accès de ${staff.profiles?.full_name || 'cet utilisateur'} au scanner ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: newStatus === 'suspended' ? 'destructive' : 'default',
          onPress: async () => {
            setTogglingId(staff.id);
            const update = { status: newStatus };
            if (newStatus === 'suspended') update.suspended_at = new Date().toISOString();
            else update.suspended_at = null;

            await supabase.from('event_staff').update(update).eq('id', staff.id);
            fetchData();
            setTogglingId(null);
          },
        },
      ]
    );
  };

  const handleRegenerateCode = (eventId, eventTitle) => {
    Alert.alert(
      'Régénérer le code ?',
      `L'ancien code ne sera plus valide. Les staffs existants conservent leur accès.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Régénérer',
          onPress: async () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let code = 'TK-';
            for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];

            const { error } = await supabase
              .from('events').update({ staff_code: code }).eq('id', eventId);

            if (error) {
              Alert.alert('Erreur', 'Impossible de régénérer le code.');
            } else {
              Alert.alert('Nouveau code', `Le nouveau code est : ${code}`);
              fetchData();
            }
          },
        },
      ]
    );
  };

  if (loading && !refreshing) {
    return <View style={styles.loader}><ActivityIndicator size="large" color={colors.blue} /></View>;
  }

  if (events.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIcon}>
          <Ionicons name="people-outline" size={40} color={colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>Aucun événement actif</Text>
        <Text style={styles.emptyText}>
          Créez un événement et partagez le code Staff à votre équipe.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={18} color={colors.blue} style={{ marginRight: 8 }} />
        <Text style={styles.infoBannerText}>
          Partagez le code d'accès à votre équipe. Ils pourront se connecter en mode Staff pour scanner les billets.
        </Text>
      </View>

      {events.filter(evt => {
        const isActive = ['approved', 'published'].includes(evt.status);
        const endDate = evt.end_date ? new Date(evt.end_date) : (evt.start_date ? new Date(evt.start_date) : null);
        const isExpired = endDate ? endDate < new Date() : false;
        return isActive && !isExpired;
      }).length === 0 && events.length > 0 && (
        <View style={styles.emptyWrap}>
          <Ionicons name="time-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Tous vos événements sont terminés</Text>
          <Text style={styles.emptyText}>Les codes d'accès staff ne sont plus actifs.</Text>
        </View>
      )}

      {events.map((evt) => {
        const isActive = ['approved', 'published'].includes(evt.status);
        const endDate = evt.end_date ? new Date(evt.end_date) : (evt.start_date ? new Date(evt.start_date) : null);
        const isExpired = endDate ? endDate < new Date() : false;
        const isDisabled = !isActive || isExpired;
        return (
        <View key={evt.id} style={[styles.eventBlock, isDisabled && { opacity: 0.6 }]}>
          {/* Event header */}
          <View style={styles.eventHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle} numberOfLines={1}>{evt.title}</Text>
              <Text style={styles.eventStaffCount}>
                {evt.staffList.length} staff{evt.staffList.length !== 1 ? 's' : ''}
                {' · '}
                {evt.staffList.filter(s => s.status === 'active').length} actif{evt.staffList.filter(s => s.status === 'active').length !== 1 ? 's' : ''}
              </Text>
            </View>
            {isExpired && (
              <View style={styles.expiredBadge}>
                <Ionicons name="time" size={12} color={colors.red} style={{ marginRight: 3 }} />
                <Text style={styles.expiredBadgeText}>Terminé</Text>
              </View>
            )}
          </View>

          {/* Staff code */}
          <View style={styles.codeRow}>
            <View style={styles.codeBox}>
              <Ionicons name="key" size={16} color={isDisabled ? colors.textMuted : '#7C3AED'} style={{ marginRight: 8 }} />
              <Text style={[styles.codeText, isDisabled && { color: colors.textMuted }]}>{evt.staff_code || 'Non généré'}</Text>
            </View>
            <TouchableOpacity style={[styles.copyBtn, isDisabled && { opacity: 0.4 }]} onPress={() => !isDisabled && handleCopyCode(evt.staff_code)} disabled={isDisabled}>
              <Ionicons name="copy-outline" size={16} color={colors.blue} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.regenBtn, isDisabled && { opacity: 0.4 }]}
              onPress={() => !isDisabled && handleRegenerateCode(evt.id, evt.title)}
              disabled={isDisabled}
            >
              <Ionicons name="refresh" size={16} color={colors.yellow} />
            </TouchableOpacity>
          </View>

          {/* Staff list */}
          {evt.staffList.length > 0 ? (
            evt.staffList.map((staff) => (
              <StaffRow
                key={staff.id}
                staff={staff}
                onToggle={(s) => handleToggleStaff(s, evt.id)}
              />
            ))
          ) : (
            <Text style={styles.noStaffText}>
              Aucun staff n'a encore rejoint cet événement.
            </Text>
          )}
        </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { padding: 40, alignItems: 'center' },
  emptyWrap: { alignItems: 'center', padding: 40 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.bluePale,
    borderWidth: 1, borderColor: colors.blueBorder, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  infoBannerText: { flex: 1, fontSize: 13, color: colors.blue, lineHeight: 18, fontWeight: '500' },

  eventBlock: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  eventHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  eventTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  eventStaffCount: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  codeRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 14,
    backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E9D5FF',
  },
  codeBox: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  codeText: { fontSize: 18, fontWeight: '800', color: '#7C3AED', letterSpacing: 2 },
  copyBtn: {
    width: 34, height: 34, borderRadius: 8, backgroundColor: colors.bluePale,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  regenBtn: {
    width: 34, height: 34, borderRadius: 8, backgroundColor: colors.yellowPale,
    alignItems: 'center', justifyContent: 'center', marginLeft: 6,
  },

  staffRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  staffName: { fontSize: 14, fontWeight: '600', color: colors.text },
  staffDate: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  toggleBtnSuspend: { backgroundColor: colors.redPale },
  toggleBtnActivate: { backgroundColor: colors.greenPale },
  toggleText: { fontSize: 12, fontWeight: '700' },
  noStaffText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 16, fontStyle: 'italic' },
  expiredBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.redPale,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1, borderColor: colors.redBorder,
  },
  expiredBadgeText: { fontSize: 11, fontWeight: '700', color: colors.red },
});
