// Admin Events — List pending events + Approve / Reject
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';

export default function AdminEventsScreen({ refreshing, onRefreshComplete }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null); // eventId being processed

  const fetchEvents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*, profiles:organizer_id (full_name, business_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEvents(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      if (onRefreshComplete) onRefreshComplete();
    }
  }, [onRefreshComplete]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { if (refreshing) { setLoading(true); fetchEvents(); } }, [refreshing, fetchEvents]);

  const handleAction = (eventId, action) => {
    const isApprove = action === 'approve';
    Alert.alert(
      isApprove ? 'Approuver l\'événement' : 'Refuser l\'événement',
      isApprove
        ? 'Confirmez-vous la validation de cet événement ?'
        : 'Confirmez-vous le refus de cet événement ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: isApprove ? 'Approuver' : 'Refuser',
          style: isApprove ? 'default' : 'destructive',
          onPress: () => processAction(eventId, action),
        },
      ]
    );
  };

  const processAction = async (eventId, action) => {
    setProcessing(eventId);
    try {
      const newStatus = action === 'approve' ? 'approved' : 'cancelled';
      const { error } = await supabase.from('events').update({ status: newStatus }).eq('id', eventId);
      if (error) throw error;
      setEvents(prev => prev.filter(e => e.id !== eventId));
      Alert.alert('Succès', `Événement ${action === 'approve' ? 'approuvé' : 'refusé'} avec succès.`);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de traiter la demande.');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <View style={styles.loader}><ActivityIndicator size="large" color={colors.blue} /></View>;
  }

  if (events.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="checkmark-circle-outline" size={56} color={colors.green} />
        <Text style={styles.emptyTitle}>Tout est à jour !</Text>
        <Text style={styles.emptyText}>Aucun événement en attente de validation.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.countText}>{events.length} événement(s) en attente</Text>
      {events.map((event) => (
        <View key={event.id} style={styles.eventCard}>
          {/* Header */}
          <View style={styles.eventHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
              <Text style={styles.organizerName}>
                {event.profiles?.business_name || event.profiles?.full_name || 'Organisateur inconnu'}
              </Text>
            </View>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>En attente</Text>
            </View>
          </View>

          {/* Info */}
          {event.description ? (
            <Text style={styles.description} numberOfLines={3}>{event.description}</Text>
          ) : null}

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} style={{ marginRight: 5 }} />
            <Text style={styles.infoText}>
              {new Date(event.start_date).toLocaleDateString('fr-FR')} → {new Date(event.end_date).toLocaleDateString('fr-FR')}
            </Text>
          </View>
          {event.location ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={styles.infoText} numberOfLines={1}>{event.location}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => handleAction(event.id, 'reject')}
              disabled={processing === event.id}
            >
              {processing === event.id ? (
                <ActivityIndicator size="small" color={colors.red} />
              ) : (
                <>
                  <Ionicons name="close" size={16} color={colors.red} style={{ marginRight: 4 }} />
                  <Text style={[styles.actionBtnText, { color: colors.red }]}>Refuser</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => handleAction(event.id, 'approve')}
              disabled={processing === event.id}
            >
              {processing === event.id ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color={colors.white} style={{ marginRight: 4 }} />
                  <Text style={[styles.actionBtnText, { color: colors.white }]}>Approuver</Text>
                </>
              )}
            </TouchableOpacity>
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
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  countText: { fontSize: 13, color: colors.textMuted, fontWeight: '600', marginBottom: 12 },
  eventCard: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1,
    borderColor: colors.border, padding: 14, marginBottom: 12,
  },
  eventHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  eventTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 3, lineHeight: 20 },
  organizerName: { fontSize: 12, color: colors.blue, fontWeight: '600' },
  pendingBadge: {
    backgroundColor: colors.yellowPale, borderWidth: 1, borderColor: colors.yellowBorder,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8,
  },
  pendingBadgeText: { fontSize: 10, fontWeight: '700', color: '#92400E' },
  description: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  infoText: { fontSize: 12, color: colors.textMuted, flex: 1 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10,
  },
  rejectBtn: { backgroundColor: colors.redPale, borderWidth: 1, borderColor: colors.redBorder },
  approveBtn: { backgroundColor: colors.green },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
});
