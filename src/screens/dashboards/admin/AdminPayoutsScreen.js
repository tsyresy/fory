// Admin Payouts — List all payouts + Mark as paid / Reject
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';

const STATUS_FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'requested', label: 'En attente' },
  { key: 'paid', label: 'Payés' },
  { key: 'rejected', label: 'Rejetés' },
];

function StatusBadge({ status }) {
  const map = {
    requested: { bg: colors.yellowPale, border: colors.yellowBorder, text: '#92400E', label: '⏱ En attente', icon: 'time-outline' },
    paid: { bg: colors.greenPale, border: colors.greenBorder, text: colors.green, label: '✓ Payé', icon: 'checkmark-circle-outline' },
    rejected: { bg: colors.redPale, border: colors.redBorder, text: colors.red, label: '✗ Rejeté', icon: 'close-circle-outline' },
  };
  const s = map[status] || map.requested;
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.bg, borderColor: s.border }]}>
      <Text style={[styles.statusBadgeText, { color: s.text }]}>{s.label}</Text>
    </View>
  );
}

export default function AdminPayoutsScreen({ refreshing, onRefreshComplete }) {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [processing, setProcessing] = useState(null);

  const fetchPayouts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('payouts')
        .select('*, profiles (full_name, phone)')
        .order('requested_at', { ascending: false });
      if (error) throw error;
      setPayouts(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      if (onRefreshComplete) onRefreshComplete();
    }
  }, [onRefreshComplete]);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);
  useEffect(() => { if (refreshing) { setLoading(true); fetchPayouts(); } }, [refreshing, fetchPayouts]);

  const handleMarkPaid = (payout) => {
    Alert.alert(
      'Marquer comme payé',
      `Avez-vous bien effectué le virement de ${Number(payout.amount).toLocaleString('fr-FR')} ${payout.currency || 'MGA'} à ${payout.profiles?.full_name || 'Organisateur'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setProcessing(payout.id + '_paid');
            const { error } = await supabase.from('payouts')
              .update({ status: 'paid', processed_at: new Date().toISOString() })
              .eq('id', payout.id);
            if (!error) setPayouts(prev => prev.map(p => p.id === payout.id ? { ...p, status: 'paid' } : p));
            else Alert.alert('Erreur', 'Mise à jour impossible.');
            setProcessing(null);
          },
        },
      ]
    );
  };

  const handleReject = (payout) => {
    Alert.alert(
      'Rejeter la demande',
      `Rejeter la demande de ${payout.profiles?.full_name || 'Organisateur'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Rejeter',
          style: 'destructive',
          onPress: async () => {
            setProcessing(payout.id + '_reject');
            const { error } = await supabase.from('payouts')
              .update({ status: 'rejected', processed_at: new Date().toISOString() })
              .eq('id', payout.id);
            if (!error) setPayouts(prev => prev.map(p => p.id === payout.id ? { ...p, status: 'rejected' } : p));
            else Alert.alert('Erreur', 'Mise à jour impossible.');
            setProcessing(null);
          },
        },
      ]
    );
  };

  const filtered = statusFilter === 'all' ? payouts : payouts.filter(p => p.status === statusFilter);
  const pendingCount = payouts.filter(p => p.status === 'requested').length;

  if (loading) {
    return <View style={styles.loader}><ActivityIndicator size="large" color={colors.blue} /></View>;
  }

  return (
    <View>
      {/* Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNum}>{pendingCount}</Text>
          <Text style={styles.summaryLabel}>En attente</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNum}>{payouts.filter(p => p.status === 'paid').length}</Text>
          <Text style={styles.summaryLabel}>Payés</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNum}>{payouts.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
      </View>

      {/* Filter */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterPill, statusFilter === f.key && styles.filterPillActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[styles.filterPillText, statusFilter === f.key && styles.filterPillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 && (
        <View style={styles.emptyWrap}>
          <Ionicons name="checkmark-done-outline" size={48} color={colors.green} />
          <Text style={styles.emptyText}>Aucune demande dans cette catégorie.</Text>
        </View>
      )}

      {/* Payout cards */}
      {filtered.map(payout => (
        <View key={payout.id} style={styles.payoutCard}>
          <View style={styles.payoutHeader}>
            <View>
              <Text style={styles.payoutOrganizer}>{payout.profiles?.full_name || 'Organisateur inconnu'}</Text>
              {payout.profiles?.phone && <Text style={styles.payoutPhone}>{payout.profiles.phone}</Text>}
            </View>
            <StatusBadge status={payout.status} />
          </View>

          <Text style={styles.payoutAmount}>
            {Number(payout.amount).toLocaleString('fr-FR')} {payout.currency || 'MGA'}
          </Text>

          <View style={styles.payoutInfo}>
            <View style={styles.infoItem}>
              <Ionicons name="card-outline" size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={styles.infoText}>{payout.payout_method?.toUpperCase()}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="key-outline" size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={styles.infoText} numberOfLines={1}>{payout.payout_reference}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="calendar-outline" size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
              <Text style={styles.infoText}>
                {new Date(payout.requested_at).toLocaleDateString('fr-FR')}
              </Text>
            </View>
          </View>

          {payout.status === 'requested' && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.btnDanger]}
                onPress={() => handleReject(payout)}
                disabled={!!processing}
              >
                {processing === payout.id + '_reject' ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={[styles.actionBtnText, { color: colors.white }]}>✗ Rejeter</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.btnGreen]}
                onPress={() => handleMarkPaid(payout)}
                disabled={!!processing}
              >
                {processing === payout.id + '_paid' ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={[styles.actionBtnText, { color: colors.white }]}>✓ Marquer Payé</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { padding: 40, alignItems: 'center' },
  summaryCard: {
    flexDirection: 'row', backgroundColor: colors.blue, borderRadius: 14,
    padding: 16, marginBottom: 16,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNum: { fontSize: 22, fontWeight: '700', color: colors.white },
  summaryLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 8 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  filterPillActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  filterPillText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  filterPillTextActive: { color: colors.white },
  emptyWrap: { padding: 40, alignItems: 'center', gap: 12 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },

  payoutCard: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1,
    borderColor: colors.border, padding: 14, marginBottom: 10,
  },
  payoutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  payoutOrganizer: { fontSize: 14, fontWeight: '700', color: colors.text },
  payoutPhone: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  payoutAmount: { fontSize: 22, fontWeight: '700', color: colors.blue, marginBottom: 10 },
  payoutInfo: { gap: 4, marginBottom: 12 },
  infoItem: { flexDirection: 'row', alignItems: 'center' },
  infoText: { fontSize: 12, color: colors.textMuted, flex: 1 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  btnGreen: { backgroundColor: colors.green },
  btnDanger: { backgroundColor: colors.red },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
});
