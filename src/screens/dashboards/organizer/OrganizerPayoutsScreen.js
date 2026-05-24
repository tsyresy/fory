// Organizer Payouts — Balance + Withdrawal form + History
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';

const METHODS = [
  { key: 'orange_money', label: '🟠 Orange Money' },
  { key: 'airtel_money', label: '🔴 Airtel Money' },
  { key: 'bank_transfer', label: '🏦 Virement Bancaire (IBAN)' },
];

const CURRENCIES = ['MGA', 'EUR', 'USD'];

function BalanceCard({ label, value, accent, icon }) {
  const hasValue = Object.values(value).some(v => v > 0);
  const formatValue = () => {
    const parts = [];
    if (value.MGA > 0) parts.push(`${value.MGA.toLocaleString('fr-FR')} MGA`);
    if (value.EUR > 0) parts.push(`${value.EUR.toLocaleString('fr-FR')} EUR`);
    if (value.USD > 0) parts.push(`${value.USD.toLocaleString('fr-FR')} USD`);
    return parts.length > 0 ? parts.join('\n') : '0 MGA';
  };
  return (
    <View style={[styles.balanceCard, { borderTopColor: accent, borderTopWidth: 3 }]}>
      <View style={[styles.balanceIcon, { backgroundColor: accent + '18' }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={styles.balanceLabel}>{label}</Text>
      <Text style={[styles.balanceValue, { color: accent }]}>{formatValue()}</Text>
    </View>
  );
}

export default function OrganizerPayoutsScreen({ user, profile, refreshing, onRefreshComplete }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState({
    totalEarned: { MGA: 0, EUR: 0, USD: 0 },
    totalWithdrawn: { MGA: 0, EUR: 0, USD: 0 },
    available: { MGA: 0, EUR: 0, USD: 0 },
  });
  const [payouts, setPayouts] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState('MGA');
  const [selectedMethod, setSelectedMethod] = useState('orange_money');
  const [reference, setReference] = useState('');
  const [refError, setRefError] = useState('');

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const { data: events } = await supabase.from('events').select('id').eq('organizer_id', user.id);
      const eventIds = events?.map(e => e.id) || [];

      let totalEarned = { MGA: 0, EUR: 0, USD: 0 };
      if (eventIds.length > 0) {
        const { data: orders } = await supabase.from('orders')
          .select('organizer_amount, currency').in('event_id', eventIds).eq('status', 'paid');
        orders?.forEach(o => { const c = o.currency || 'MGA'; totalEarned[c] = (totalEarned[c] || 0) + Number(o.organizer_amount); });
      }

      const { data: pastPayouts } = await supabase.from('payouts')
        .select('*').eq('organizer_id', user.id).order('requested_at', { ascending: false });
      setPayouts(pastPayouts || []);

      let totalWithdrawn = { MGA: 0, EUR: 0, USD: 0 };
      (pastPayouts || []).filter(p => p.status !== 'rejected').forEach(p => {
        const c = p.currency || 'MGA'; totalWithdrawn[c] = (totalWithdrawn[c] || 0) + Number(p.amount);
      });

      const available = {
        MGA: (totalEarned.MGA || 0) - (totalWithdrawn.MGA || 0),
        EUR: (totalEarned.EUR || 0) - (totalWithdrawn.EUR || 0),
        USD: (totalEarned.USD || 0) - (totalWithdrawn.USD || 0),
      };

      setBalance({ totalEarned, totalWithdrawn, available });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      if (onRefreshComplete) onRefreshComplete();
    }
  }, [user, onRefreshComplete]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (refreshing) { setLoading(true); fetchData(); } }, [refreshing, fetchData]);

  const handleWithdraw = async () => {
    const amount = balance.available[selectedCurrency] || 0;
    if (amount <= 0) {
      Alert.alert('Solde insuffisant', `Vous n'avez pas de solde disponible en ${selectedCurrency}.`);
      return;
    }
    if (!reference || reference.trim().length < 5) {
      setRefError('La référence doit contenir au moins 5 caractères.');
      return;
    }
    setRefError('');

    Alert.alert(
      'Confirmer le retrait',
      `Vous allez demander le virement de ${amount.toLocaleString('fr-FR')} ${selectedCurrency} via ${selectedMethod} (${reference}).`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setSubmitting(true);
            try {
              const { data, error } = await supabase.from('payouts').insert({
                organizer_id: user.id, amount, currency: selectedCurrency,
                payout_method: selectedMethod, payout_reference: reference.trim(), status: 'requested',
              }).select().single();
              if (error) throw error;

              try {
                await supabase.functions.invoke('send-admin-email', {
                  body: {
                    type: 'withdrawal_request',
                    payload: {
                      organizerName: profile?.business_name || profile?.full_name || 'Organisateur',
                      organizerEmail: user.email, amount, currency: selectedCurrency,
                      method: selectedMethod, reference: reference.trim(),
                    },
                  },
                });
              } catch (_) {}

              setPayouts(prev => [data, ...prev]);
              setBalance(prev => ({
                ...prev,
                totalWithdrawn: { ...prev.totalWithdrawn, [selectedCurrency]: (prev.totalWithdrawn[selectedCurrency] || 0) + amount },
                available: { ...prev.available, [selectedCurrency]: 0 },
              }));
              setReference('');
              Alert.alert('Succès', 'Demande de retrait envoyée avec succès.');
            } catch (e) {
              Alert.alert('Erreur', e.message || 'Impossible d\'envoyer la demande.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const statusIcon = (s) => ({ paid: 'checkmark-circle', rejected: 'close-circle', requested: 'time' }[s] || 'time');
  const statusColor = (s) => ({ paid: colors.green, rejected: colors.red, requested: colors.yellow }[s] || colors.yellow);

  if (loading) {
    return <View style={styles.loader}><ActivityIndicator size="large" color={colors.blue} /></View>;
  }

  return (
    <View>
      {/* Balance */}
      <Text style={styles.sectionHeader}>Trésorerie</Text>
      <View style={styles.balanceGrid}>
        <BalanceCard label="Solde disponible" value={balance.available} accent={colors.blue} icon="wallet-outline" />
        <BalanceCard label="Retiré / En cours" value={balance.totalWithdrawn} accent={colors.yellow} icon="arrow-down-outline" />
        <BalanceCard label="Total gagné" value={balance.totalEarned} accent={colors.green} icon="trending-up-outline" />
      </View>

      {/* Withdrawal Form */}
      <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Demander un retrait</Text>
      <View style={styles.formCard}>
        {/* Currency selector */}
        <Text style={styles.formLabel}>Devise à retirer</Text>
        <View style={styles.currencyRow}>
          {CURRENCIES.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.currencyBtn, selectedCurrency === c && styles.currencyBtnActive]}
              onPress={() => setSelectedCurrency(c)}
            >
              <Text style={[styles.currencyBtnText, selectedCurrency === c && styles.currencyBtnTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Amount display */}
        <Text style={styles.formLabel}>Montant à retirer</Text>
        <View style={styles.amountDisplay}>
          <Text style={styles.amountText}>
            {(balance.available[selectedCurrency] || 0).toLocaleString('fr-FR')} {selectedCurrency}
          </Text>
        </View>

        {/* Method */}
        <Text style={styles.formLabel}>Méthode de paiement</Text>
        <View style={styles.methodList}>
          {METHODS.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.methodBtn, selectedMethod === m.key && styles.methodBtnActive]}
              onPress={() => setSelectedMethod(m.key)}
            >
              <Text style={[styles.methodBtnText, selectedMethod === m.key && styles.methodBtnTextActive]}>
                {m.label}
              </Text>
              {selectedMethod === m.key && (
                <Ionicons name="checkmark-circle" size={16} color={colors.blue} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Reference */}
        <Text style={styles.formLabel}>Référence (numéro de compte / téléphone)</Text>
        <TextInput
          style={[styles.refInput, refError && styles.refInputError]}
          placeholder="Ex: +261 32 00 000 00 ou IBAN..."
          placeholderTextColor={colors.textMuted}
          value={reference}
          onChangeText={(v) => { setReference(v); setRefError(''); }}
        />
        {refError ? <Text style={styles.errorText}>{refError}</Text> : null}

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleWithdraw}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="arrow-down-circle-outline" size={18} color={colors.white} style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>Confirmer le retrait</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* History */}
      <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Historique des retraits</Text>
      {payouts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>Aucune demande de retrait effectuée.</Text>
        </View>
      ) : (
        payouts.map(payout => (
          <View key={payout.id} style={styles.historyCard}>
            <View style={styles.historyLeft}>
              <View style={[styles.historyIcon, { backgroundColor: statusColor(payout.status) + '18' }]}>
                <Ionicons name={statusIcon(payout.status)} size={18} color={statusColor(payout.status)} />
              </View>
              <View>
                <Text style={styles.historyAmount}>
                  {Number(payout.amount).toLocaleString('fr-FR')} {payout.currency || 'MGA'}
                </Text>
                <Text style={styles.historyMethod}>
                  {payout.payout_method?.toUpperCase()} · {payout.payout_reference}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.historyStatus, { color: statusColor(payout.status) }]}>
                {payout.status === 'requested' ? 'En attente' : payout.status === 'paid' ? 'Payé' : 'Rejeté'}
              </Text>
              <Text style={styles.historyDate}>{new Date(payout.requested_at).toLocaleDateString('fr-FR')}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { padding: 40, alignItems: 'center' },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },

  // Balance
  balanceGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  balanceCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  balanceIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  balanceLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  balanceValue: { fontSize: 13, fontWeight: '700', textAlign: 'center' },

  // Form
  formCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  formLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginTop: 4 },
  currencyRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  currencyBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center',
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  currencyBtnActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  currencyBtnText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  currencyBtnTextActive: { color: colors.white },
  amountDisplay: {
    backgroundColor: colors.bluePale, borderRadius: 10, padding: 12,
    alignItems: 'center', marginBottom: 14,
  },
  amountText: { fontSize: 20, fontWeight: '700', color: colors.blue },
  methodList: { gap: 6, marginBottom: 14 },
  methodBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  methodBtnActive: { borderColor: colors.blue, backgroundColor: colors.bluePale },
  methodBtnText: { fontSize: 14, color: colors.textSecondary },
  methodBtnTextActive: { color: colors.blue, fontWeight: '600' },
  refInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text,
    backgroundColor: colors.surfaceAlt, marginBottom: 4,
  },
  refInputError: { borderColor: colors.red },
  errorText: { fontSize: 12, color: colors.red, marginBottom: 10 },
  submitBtn: {
    backgroundColor: colors.blue, borderRadius: 12, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },

  // History
  emptyWrap: { alignItems: 'center', padding: 32, gap: 10 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  historyCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    padding: 12, marginBottom: 8,
  },
  historyLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  historyIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  historyAmount: { fontSize: 15, fontWeight: '700', color: colors.text },
  historyMethod: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  historyStatus: { fontSize: 12, fontWeight: '700' },
  historyDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
