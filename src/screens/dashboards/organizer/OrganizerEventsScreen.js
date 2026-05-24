// Organizer Events — My events list with status badges + Tickets/Edit actions
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';

const STATUS_CONFIG = {
  published: { label: 'Publié', bg: colors.greenPale, border: colors.greenBorder, text: colors.green },
  approved: { label: 'Approuvé', bg: colors.bluePale, border: colors.blueBorder, text: colors.blue },
  pending: { label: 'En attente', bg: colors.yellowPale, border: colors.yellowBorder, text: '#92400E' },
  draft: { label: 'Brouillon', bg: colors.surfaceAlt, border: colors.border, text: colors.textMuted },
  cancelled: { label: 'Annulé', bg: colors.redPale, border: colors.redBorder, text: colors.red },
  ended: { label: 'Terminé', bg: colors.surfaceAlt, border: colors.borderStrong, text: colors.textSecondary },
};

function StatusBadge({ status }) {
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.bg, borderColor: s.border }]}>
      <Text style={[styles.statusBadgeText, { color: s.text }]}>{s.label}</Text>
    </View>
  );
}

export default function OrganizerEventsScreen({ user, refreshing, onRefreshComplete, onCreateEvent }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEvents(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      if (onRefreshComplete) onRefreshComplete();
    }
  }, [user, onRefreshComplete]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { if (refreshing) { setLoading(true); fetchEvents(); } }, [refreshing, fetchEvents]);

  const handleTickets = (event) => {
    Alert.alert(
      `Billets — ${event.title}`,
      'La gestion des types de billets est disponible sur la plateforme web tapakeel.com',
      [{ text: 'OK' }]
    );
  };

  const handleEdit = (event) => {
    Alert.alert(
      'Modifier l\'événement',
      'La modification complète d\'un événement est disponible sur la plateforme web tapakeel.com',
      [{ text: 'OK' }]
    );
  };

  if (loading) {
    return <View style={styles.loader}><ActivityIndicator size="large" color={colors.blue} /></View>;
  }

  if (events.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="calendar-outline" size={56} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Aucun événement</Text>
        <Text style={styles.emptyText}>Vous n'avez pas encore créé d'événement.</Text>
        <TouchableOpacity style={styles.createBtn} onPress={onCreateEvent}>
          <Ionicons name="add" size={18} color={colors.white} style={{ marginRight: 6 }} />
          <Text style={styles.createBtnText}>Créer sur tapakeel.com</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      {/* Header */}
      <View style={styles.listHeader}>
        <Text style={styles.countText}>{events.length} événement(s)</Text>
        <TouchableOpacity style={styles.newBtn} onPress={onCreateEvent}>
          <Ionicons name="add" size={16} color={colors.white} style={{ marginRight: 4 }} />
          <Text style={styles.newBtnText}>Nouveau</Text>
        </TouchableOpacity>
      </View>

      {events.map(event => (
        <View key={event.id} style={styles.eventCard}>
          {/* Banner */}
          {event.banner_url ? (
            <Image source={{ uri: event.banner_url }} style={styles.banner} resizeMode="cover" />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <Ionicons name="image-outline" size={28} color={colors.textDim} />
            </View>
          )}

          {/* Content */}
          <View style={styles.eventContent}>
            <View style={styles.topRow}>
              <StatusBadge status={event.status} />
              {event.category && <Text style={styles.category}>{event.category}</Text>}
            </View>
            <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>

            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={styles.infoText}>
                {new Date(event.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            {event.location && (
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
                <Text style={styles.infoText} numberOfLines={1}>{event.location}</Text>
              </View>
            )}
            {event.total_capacity && (
              <View style={styles.infoRow}>
                <Ionicons name="people-outline" size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
                <Text style={styles.infoText}>Capacité: {event.total_capacity}</Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  (event.status === 'approved' || event.status === 'published')
                    ? styles.btnBlue : styles.btnDisabled,
                ]}
                onPress={() => (event.status === 'approved' || event.status === 'published') && handleTickets(event)}
                disabled={event.status !== 'approved' && event.status !== 'published'}
              >
                <Ionicons name="ticket-outline" size={14} color={
                  (event.status === 'approved' || event.status === 'published') ? colors.blue : colors.textMuted
                } style={{ marginRight: 4 }} />
                <Text style={[styles.actionBtnText, {
                  color: (event.status === 'approved' || event.status === 'published') ? colors.blue : colors.textMuted
                }]}>Billets</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.btnSecondary]} onPress={() => handleEdit(event)}>
                <Ionicons name="create-outline" size={14} color={colors.blue} style={{ marginRight: 4 }} />
                <Text style={[styles.actionBtnText, { color: colors.blue }]}>Modifier</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { padding: 40, alignItems: 'center' },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
  createBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.blue, paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 12,
  },
  createBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  countText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  newBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.blue, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
  },
  newBtnText: { color: colors.white, fontWeight: '700', fontSize: 12 },

  eventCard: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1,
    borderColor: colors.border, marginBottom: 14, overflow: 'hidden',
  },
  banner: { width: '100%', height: 130 },
  bannerPlaceholder: {
    width: '100%', height: 90,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  eventContent: { padding: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  category: { fontSize: 11, color: colors.textMuted, fontWeight: '500', textTransform: 'capitalize' },
  eventTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8, lineHeight: 20 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  infoText: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, borderRadius: 9,
  },
  btnBlue: { backgroundColor: colors.bluePale, borderWidth: 1, borderColor: colors.blueBorder },
  btnSecondary: { backgroundColor: colors.bluePale, borderWidth: 1, borderColor: colors.blueBorder },
  btnDisabled: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
});
