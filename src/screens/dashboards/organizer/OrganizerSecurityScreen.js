// Organizer Security — PIN Management & Biometric Toggle
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, Switch,
  Modal, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../theme/colors';
import { hashPin } from '../../../lib/hashPin';

function PinInput({ value, onChangeText, placeholder = '••••', maxLength = 6, autoFocus = false }) {
  const inputRef = useRef(null);
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => inputRef.current?.focus()}
      style={styles.pinInputWrap}
    >
      <View style={styles.pinDotsRow}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.pinDot,
              i < value.length && styles.pinDotFilled,
            ]}
          />
        ))}
      </View>
      <TextInput
        ref={inputRef}
        style={styles.pinHiddenInput}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/\D/g, ''))}
        maxLength={maxLength}
        keyboardType="number-pad"
        secureTextEntry
        autoFocus={autoFocus}
        placeholder={placeholder}
      />
    </TouchableOpacity>
  );
}

export default function OrganizerSecurityScreen({ user, profile, refreshing, onRefreshComplete }) {
  const [hasPin, setHasPin] = useState(!!profile?.pin_hash);
  const [biometricEnabled, setBiometricEnabled] = useState(!!profile?.biometric_enabled);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState(null); // 'face' | 'fingerprint' | null
  const [loading, setLoading] = useState(false);

  // PIN form state
  const [showPinForm, setShowPinForm] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState('');

  // Biometric toggle
  const [bioToggling, setBioToggling] = useState(false);

  useEffect(() => {
    checkBiometricAvailability();
    if (onRefreshComplete) onRefreshComplete();
  }, []);

  useEffect(() => {
    if (profile) {
      setHasPin(!!profile.pin_hash);
      setBiometricEnabled(!!profile.biometric_enabled);
    }
  }, [profile]);

  const checkBiometricAvailability = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(compatible && enrolled);

      // Detect type: Face ID vs Fingerprint
      if (compatible) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('face');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('fingerprint');
        }
      }
    } catch (e) {
      setBiometricAvailable(false);
    }
  };

  const handleSetPin = async () => {
    setPinError('');

    if (newPin.length < 4 || newPin.length > 6) {
      setPinError('Le code PIN doit contenir entre 4 et 6 chiffres.');
      return;
    }
    if (!/^\d+$/.test(newPin)) {
      setPinError('Le code PIN ne doit contenir que des chiffres.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('Les codes PIN ne correspondent pas.');
      return;
    }

    // Verify current PIN if changing
    if (hasPin) {
      if (!currentPin) {
        setPinError('Veuillez entrer votre code PIN actuel.');
        return;
      }
      const currentHash = await hashPin(currentPin);
      if (currentHash !== profile.pin_hash) {
        setPinError('Le code PIN actuel est incorrect.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
    }

    setPinSubmitting(true);
    try {
      const pinHash = await hashPin(newPin);
      const { error } = await supabase
        .from('profiles')
        .update({
          pin_hash: pinHash,
          pin_set_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      Alert.alert('Succès', hasPin ? 'Code PIN modifié avec succès' : 'Code PIN créé avec succès');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHasPin(true);
      setShowPinForm(false);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');

      // Refresh profile
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        const { useAuthStore } = require('../../../store/authStore');
        useAuthStore.getState().setProfile(data);
      }
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de mettre à jour le code PIN.');
      console.error(err);
    } finally {
      setPinSubmitting(false);
    }
  };

  const handleRemovePin = async () => {
    Alert.alert(
      'Supprimer le code PIN',
      'Êtes-vous sûr de vouloir supprimer votre code PIN de sécurité ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            // Verify current PIN first
            if (!currentPin) {
              setPinError('Entrez votre code PIN actuel pour le supprimer.');
              return;
            }
            const currentHash = await hashPin(currentPin);
            if (currentHash !== profile.pin_hash) {
              setPinError('Code PIN incorrect.');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              return;
            }

            setPinSubmitting(true);
            try {
              const { error } = await supabase
                .from('profiles')
                .update({ pin_hash: null, pin_set_at: null })
                .eq('id', user.id);

              if (error) throw error;

              Alert.alert('Succès', 'Code PIN supprimé.');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setHasPin(false);
              setShowPinForm(false);
              setCurrentPin('');
              setNewPin('');
              setConfirmPin('');

              const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
              if (data) {
                const { useAuthStore } = require('../../../store/authStore');
                useAuthStore.getState().setProfile(data);
              }
            } catch (err) {
              Alert.alert('Erreur', 'Impossible de supprimer le code PIN.');
            } finally {
              setPinSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleToggleBiometric = async () => {
    setBioToggling(true);
    try {
      const newValue = !biometricEnabled;

      // If enabling, verify biometric first
      if (newValue) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Vérification biométrique',
          cancelLabel: 'Annuler',
          disableDeviceFallback: false,
        });
        if (!result.success) {
          setBioToggling(false);
          return;
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({ biometric_enabled: newValue })
        .eq('id', user.id);

      if (error) throw error;

      setBiometricEnabled(newValue);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Succès',
        newValue
          ? 'Verrou biométrique activé. L\'authentification sera demandée au démarrage.'
          : 'Verrou biométrique désactivé.'
      );

      // Refresh profile
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        const { useAuthStore } = require('../../../store/authStore');
        useAuthStore.getState().setProfile(data);
      }
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de mettre à jour le paramètre biométrique.');
      console.error(err);
    } finally {
      setBioToggling(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={[styles.headerIcon, { backgroundColor: colors.bluePale }]}>
            <Ionicons name="shield-checkmark" size={22} color={colors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Sécurité</Text>
            <Text style={styles.headerSub}>Protégez votre compte et vos transactions</Text>
          </View>
        </View>

        {/* ─── PIN Code Section ─────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="key" size={18} color={colors.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Code PIN de sécurité</Text>
              <Text style={styles.cardDesc}>Protégez vos demandes de retrait</Text>
            </View>
          </View>

          {/* Status badge */}
          <View style={[styles.statusBadge, hasPin ? styles.statusActive : styles.statusWarning]}>
            <Ionicons
              name={hasPin ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={hasPin ? colors.green : '#D97706'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.statusText, hasPin ? styles.statusTextActive : styles.statusTextWarning]}>
              {hasPin
                ? `Code PIN actif — configuré le ${profile?.pin_set_at ? new Date(profile.pin_set_at).toLocaleDateString('fr-FR') : '—'}`
                : 'Aucun code PIN — vos retraits ne sont pas protégés'}
            </Text>
          </View>

          {!showPinForm ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setShowPinForm(true)}
              activeOpacity={0.8}
            >
              <Ionicons name={hasPin ? 'create-outline' : 'add-circle-outline'} size={18} color={colors.white} style={{ marginRight: 8 }} />
              <Text style={styles.actionBtnText}>{hasPin ? 'Modifier le code PIN' : 'Créer un code PIN'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.pinForm}>
              {hasPin && (
                <>
                  <Text style={styles.pinLabel}>Code PIN actuel</Text>
                  <PinInput value={currentPin} onChangeText={setCurrentPin} autoFocus />
                </>
              )}

              <Text style={styles.pinLabel}>{hasPin ? 'Nouveau code PIN' : 'Créer un code PIN'}</Text>
              <PinInput value={newPin} onChangeText={setNewPin} autoFocus={!hasPin} />

              <Text style={styles.pinLabel}>Confirmer le code PIN</Text>
              <PinInput value={confirmPin} onChangeText={setConfirmPin} />

              {pinError ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={14} color={colors.red} style={{ marginRight: 4 }} />
                  <Text style={styles.errorText}>{pinError}</Text>
                </View>
              ) : null}

              <View style={styles.pinActions}>
                <TouchableOpacity
                  style={[styles.pinActionBtn, styles.pinPrimaryBtn]}
                  onPress={handleSetPin}
                  disabled={pinSubmitting}
                >
                  {pinSubmitting ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Ionicons name="lock-closed" size={16} color={colors.white} style={{ marginRight: 6 }} />
                      <Text style={styles.pinActionText}>{hasPin ? 'Modifier' : 'Créer'}</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.pinActionBtn, styles.pinCancelBtn]}
                  onPress={() => {
                    setShowPinForm(false);
                    setCurrentPin('');
                    setNewPin('');
                    setConfirmPin('');
                    setPinError('');
                  }}
                >
                  <Text style={[styles.pinActionText, { color: colors.textSecondary }]}>Annuler</Text>
                </TouchableOpacity>
              </View>

              {hasPin && (
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={handleRemovePin}
                  disabled={pinSubmitting}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.red} style={{ marginRight: 6 }} />
                  <Text style={styles.removeBtnText}>Supprimer le PIN</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* ─── Biometric Section ───────────────────── */}
        {(() => {
          const isFace = biometricType === 'face';
          const bioIcon = isFace ? 'scan-outline' : 'finger-print';
          const bioLabel = isFace ? 'Face ID' : (Platform.OS === 'ios' ? 'Touch ID' : 'Empreinte digitale');

          return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#EDE9FE' }]}>
              <Ionicons name={bioIcon} size={18} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Verrou biométrique</Text>
              <Text style={styles.cardDesc}>{bioLabel} au démarrage</Text>
            </View>
          </View>

          <View style={styles.bioRow}>
            <View style={styles.bioLeft}>
              <Ionicons
                name={bioIcon}
                size={24}
                color={biometricEnabled ? '#7C3AED' : colors.textMuted}
              />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.bioStatus}>
                  {biometricEnabled ? 'Activé' : 'Désactivé'}
                </Text>
                <Text style={styles.bioHint}>{bioLabel}</Text>
              </View>
            </View>
            {biometricAvailable ? (
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometric}
                disabled={bioToggling}
                trackColor={{ false: colors.border, true: '#7C3AED' }}
                thumbColor={biometricEnabled ? '#EDE9FE' : '#F1F5F9'}
                ios_backgroundColor={colors.border}
              />
            ) : (
              <View style={styles.bioUnavailable}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.textMuted} style={{ marginRight: 4 }} />
                <Text style={styles.bioUnavailableText}>Non disponible</Text>
              </View>
            )}
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={16} color={colors.blue} style={{ marginRight: 8, marginTop: 1 }} />
            <Text style={styles.infoText}>
              {Platform.OS === 'ios'
                ? `Lorsque activé, ${bioLabel} sera demandé au démarrage. En cas d'échec, vous pourrez utiliser votre code d'accès.`
                : `Lorsque activé, l'authentification par ${bioLabel.toLowerCase()} sera demandée au démarrage de l'application.`
              }
            </Text>
          </View>
        </View>
          );
        })()}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 40 },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  headerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  // Card
  card: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardDesc: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  // Status badge
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginBottom: 14 },
  statusActive: { backgroundColor: colors.greenPale, borderWidth: 1, borderColor: colors.greenBorder },
  statusWarning: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' },
  statusText: { fontSize: 12, fontWeight: '500', flex: 1 },
  statusTextActive: { color: colors.green },
  statusTextWarning: { color: '#D97706' },

  // Action button
  actionBtn: {
    backgroundColor: colors.blue, borderRadius: 12, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  actionBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  // PIN form
  pinForm: { gap: 6 },
  pinLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 8, marginBottom: 4 },

  pinInputWrap: {
    backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
    alignItems: 'center',
  },
  pinDotsRow: { flexDirection: 'row', gap: 10 },
  pinDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: colors.border, backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: colors.blue, borderColor: colors.blue,
  },
  pinHiddenInput: {
    position: 'absolute', width: '100%', height: '100%',
    opacity: 0, fontSize: 1,
  },

  pinActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pinActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
  pinPrimaryBtn: { backgroundColor: colors.blue },
  pinCancelBtn: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  pinActionText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingVertical: 8 },
  removeBtnText: { color: colors.red, fontWeight: '600', fontSize: 13 },

  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  errorText: { color: colors.red, fontSize: 12, fontWeight: '500' },

  // Biometric
  bioRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.background, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: 12,
  },
  bioLeft: { flexDirection: 'row', alignItems: 'center' },
  bioStatus: { fontSize: 14, fontWeight: '600', color: colors.text },
  bioHint: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  bioUnavailable: { flexDirection: 'row', alignItems: 'center' },
  bioUnavailableText: { fontSize: 11, color: colors.textMuted },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.bluePale, borderWidth: 1, borderColor: colors.blueBorder,
    borderRadius: 10, padding: 12,
  },
  infoText: { fontSize: 12, color: colors.blue, flex: 1, lineHeight: 17 },
});
