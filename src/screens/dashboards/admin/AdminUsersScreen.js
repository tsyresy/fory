// Admin Users — List all users + filter + suspend/activate + scan authorization
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';

const ROLES = [
  { key: 'all', label: 'Tous' },
  { key: 'buyer', label: 'Acheteurs' },
  { key: 'organizer', label: 'Organisateurs' },
  { key: 'admin', label: 'Admins' },
];

function RoleBadge({ role }) {
  const map = {
    admin: { bg: colors.bluePale, text: colors.blue, label: 'Admin' },
    organizer: { bg: colors.yellowPale, text: '#92400E', label: 'Organisateur' },
    buyer: { bg: colors.greenPale, text: colors.green, label: 'Acheteur' },
  };
  const style = map[role] || { bg: colors.surfaceAlt, text: colors.textMuted, label: role };
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.badgeText, { color: style.text }]}>{style.label}</Text>
    </View>
  );
}

export default function AdminUsersScreen({ refreshing, onRefreshComplete }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      if (onRefreshComplete) onRefreshComplete();
    }
  }, [onRefreshComplete]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (refreshing) { setLoading(true); fetchUsers(); } }, [refreshing, fetchUsers]);

  const handleToggleSuspend = (user) => {
    const willSuspend = !user.is_suspended;
    Alert.alert(
      willSuspend ? 'Suspendre le compte' : 'Réactiver le compte',
      willSuspend
        ? `Suspendre ${user.full_name || 'cet utilisateur'} ?`
        : `Réactiver le compte de ${user.full_name || 'cet utilisateur'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: willSuspend ? 'Suspendre' : 'Réactiver',
          style: willSuspend ? 'destructive' : 'default',
          onPress: async () => {
            setProcessing(user.id + '_suspend');
            const { error } = await supabase.from('profiles').update({ is_suspended: willSuspend }).eq('id', user.id);
            if (!error) setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_suspended: willSuspend } : u));
            else Alert.alert('Erreur', 'Modification impossible.');
            setProcessing(null);
          },
        },
      ]
    );
  };

  const handleToggleScan = (user) => {
    const willGrant = !user.scan_authorized;
    Alert.alert(
      willGrant ? 'Autoriser le scan' : 'Retirer l\'autorisation',
      willGrant
        ? `Autoriser ${user.full_name || 'cet organisateur'} à scanner les billets ?`
        : `Retirer l'autorisation de scan de ${user.full_name || 'cet organisateur'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: willGrant ? 'Autoriser' : 'Retirer',
          onPress: async () => {
            setProcessing(user.id + '_scan');
            const { error } = await supabase.from('profiles').update({ scan_authorized: willGrant }).eq('id', user.id);
            if (!error) setUsers(prev => prev.map(u => u.id === user.id ? { ...u, scan_authorized: willGrant } : u));
            else Alert.alert('Erreur', 'Modification impossible.');
            setProcessing(null);
          },
        },
      ]
    );
  };

  const filtered = users.filter(u => {
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const matchSearch = !search || (u.full_name || '').toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  if (loading) {
    return <View style={styles.loader}><ActivityIndicator size="large" color={colors.blue} /></View>;
  }

  return (
    <View>
      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un utilisateur…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Role filter */}
      <View style={styles.filterRow}>
        {ROLES.map(r => (
          <TouchableOpacity
            key={r.key}
            style={[styles.filterPill, roleFilter === r.key && styles.filterPillActive]}
            onPress={() => setRoleFilter(r.key)}
          >
            <Text style={[styles.filterPillText, roleFilter === r.key && styles.filterPillTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.countText}>{filtered.length} utilisateur(s)</Text>

      {/* User list */}
      {filtered.map(u => (
        <View key={u.id} style={[styles.userCard, u.is_suspended && styles.userCardSuspended]}>
          {/* Top row */}
          <View style={styles.userTopRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.avatarText}>
                {(u.full_name || u.email || '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.userName}>{u.full_name || 'Sans nom'}</Text>
              <Text style={styles.userId} numberOfLines={1}>#{u.id.substring(0, 10)}…</Text>
            </View>
            <RoleBadge role={u.role} />
          </View>

          {/* Status info row */}
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: u.is_suspended ? colors.red : colors.green }]} />
              <Text style={styles.statusText}>{u.is_suspended ? 'Suspendu' : 'Actif'}</Text>
            </View>
            {u.role === 'organizer' && (
              <View style={styles.statusItem}>
                <Ionicons name="scan-outline" size={12} color={u.scan_authorized ? colors.blue : colors.textMuted} style={{ marginRight: 4 }} />
                <Text style={[styles.statusText, { color: u.scan_authorized ? colors.blue : colors.textMuted }]}>
                  Scan {u.scan_authorized ? 'autorisé' : 'non autorisé'}
                </Text>
              </View>
            )}
            <Text style={styles.joinDate}>{new Date(u.created_at).toLocaleDateString('fr-FR')}</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            {u.role === 'organizer' && (
              <TouchableOpacity
                style={[styles.actionBtn, u.scan_authorized ? styles.btnSecondary : styles.btnBlue]}
                onPress={() => handleToggleScan(u)}
                disabled={!!processing}
              >
                {processing === u.id + '_scan' ? (
                  <ActivityIndicator size="small" color={u.scan_authorized ? colors.blue : colors.white} />
                ) : (
                  <>
                    <Ionicons name="scan-outline" size={13} color={u.scan_authorized ? colors.blue : colors.white} style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, { color: u.scan_authorized ? colors.blue : colors.white }]}>
                      {u.scan_authorized ? 'Retirer scan' : 'Autoriser scan'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {u.role !== 'admin' && (
              <TouchableOpacity
                style={[styles.actionBtn, u.is_suspended ? styles.btnGreen : styles.btnDanger]}
                onPress={() => handleToggleSuspend(u)}
                disabled={!!processing}
              >
                {processing === u.id + '_suspend' ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name={u.is_suspended ? 'person-add-outline' : 'person-remove-outline'} size={13} color={colors.white} style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, { color: colors.white }]}>
                      {u.is_suspended ? 'Réactiver' : 'Suspendre'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {filtered.length === 0 && (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Aucun utilisateur trouvé.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { padding: 40, alignItems: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  filterPillActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  filterPillText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  filterPillTextActive: { color: colors.white },
  countText: { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginBottom: 10 },

  userCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10,
  },
  userCardSuspended: { borderColor: colors.redBorder, backgroundColor: '#FFF5F5' },
  userTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  userAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bluePale, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.blue },
  userName: { fontSize: 14, fontWeight: '700', color: colors.text },
  userId: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  statusRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statusItem: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  statusText: { fontSize: 12, color: colors.textSecondary },
  joinDate: { fontSize: 11, color: colors.textMuted, marginLeft: 'auto' },

  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: 8,
  },
  btnBlue: { backgroundColor: colors.blue },
  btnSecondary: { backgroundColor: colors.bluePale, borderWidth: 1, borderColor: colors.blueBorder },
  btnDanger: { backgroundColor: colors.red },
  btnGreen: { backgroundColor: colors.green },
  actionBtnText: { fontSize: 12, fontWeight: '700' },

  emptyWrap: { padding: 40, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 14 },
});
