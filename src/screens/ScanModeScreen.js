import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  withRepeat, withSequence, Easing, runOnJS,
} from 'react-native-reanimated';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';

export default function ScanModeScreen() {
  const { user, profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanResult, setScanResult] = useState(null);

  const isAuthorized = profile?.scan_authorized || profile?.role === 'admin';

  // Animations
  const cornerOpacity = useSharedValue(0.6);
  const resultOpacity = useSharedValue(0);
  const resultScale = useSharedValue(0.85);
  const resultY = useSharedValue(20);

  useEffect(() => {
    cornerOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.35, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      ), -1, false
    );
  }, []);

  const cornerAnim = useAnimatedStyle(() => ({ opacity: cornerOpacity.value }));
  const resultAnim = useAnimatedStyle(() => ({
    opacity: resultOpacity.value,
    transform: [{ scale: resultScale.value }, { translateY: resultY.value }],
  }));

  const showResult = useCallback((result) => {
    setScanResult(result);
    resultOpacity.value = withTiming(1, { duration: 250 });
    resultScale.value = withSpring(1, { damping: 16, stiffness: 200 });
    resultY.value = withSpring(0, { damping: 18, stiffness: 200 });
  }, []);

  const hideResult = useCallback(() => {
    resultOpacity.value = withTiming(0, { duration: 220 }, (done) => {
      if (done) { runOnJS(setScanResult)(null); runOnJS(setScanned)(false); }
    });
    resultScale.value = withTiming(0.88, { duration: 220 });
    resultY.value = withTiming(12, { duration: 220 });
  }, []);

  useEffect(() => { if (isAuthorized) fetchEvents(); }, [isAuthorized]);

  const fetchEvents = async () => {
    setLoading(true);
    let query = supabase.from('events').select('id, title').in('status', ['approved', 'published']);
    if (profile?.role !== 'admin') query = query.eq('organizer_id', user.id);
    const { data } = await query;
    if (data) { setEvents(data); if (data.length > 0) setSelectedEventId(data[0].id); }
    setLoading(false);
  };

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      let ticketId = data;
      try { const p = JSON.parse(data); if (p.ticket_id) ticketId = p.ticket_id; } catch (_) {}

      const { data: ticket, error } = await supabase.from('tickets').select('*, events(title)').eq('qr_code', ticketId).single();

      if (error || !ticket) {
        const { data: tById, error: e2 } = await supabase.from('tickets').select('*, events(title)').eq('id', ticketId).single();
        if (e2 || !tById) throw new Error('Non trouvé');
        processTicket(tById);
      } else {
        processTicket(ticket);
      }
    } catch (_) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showResult({ type: 'invalid', message: 'Billet invalide ou non trouvé' });
      setTimeout(hideResult, 3000);
    }
  };

  const processTicket = async (ticket) => {
    if (ticket.event_id !== selectedEventId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showResult({ type: 'invalid', message: 'Billet non assigné à cet événement' });
      setTimeout(hideResult, 3000); return;
    }
    if (ticket.status === 'used') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showResult({ type: 'used', message: 'Billet déjà utilisé' });
      setTimeout(hideResult, 3000); return;
    }
    if (ticket.status !== 'valid') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showResult({ type: 'invalid', message: 'Billet invalide' });
      setTimeout(hideResult, 3000); return;
    }

    await supabase.from('tickets').update({ status: 'used' }).eq('id', ticket.id);
    await supabase.from('ticket_scans').insert({ ticket_id: ticket.id, scanned_by: user.id, result: 'granted' });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showResult({ type: 'valid', message: '✓ Billet Authentique', eventName: ticket.events?.title });
    setTimeout(hideResult, 3500);
  };

  // ─── States ───────────────────────────────────────────────────────────────
  if (!isAuthorized) {
    return (
      <View style={[styles.fill, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.infoCard}>
          <Ionicons name="lock-closed" size={44} color={colors.textMuted} style={{ marginBottom: 14 }} />
          <Text style={styles.infoTitle}>Accès restreint</Text>
          <Text style={styles.infoText}>Vous n'êtes pas autorisé à utiliser le scanner. Faites une demande depuis le tableau de bord.</Text>
        </View>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.fill}><ActivityIndicator style={{ flex: 1 }} size="large" color={colors.blue} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.centered]}>
        <Ionicons name="camera-outline" size={56} color={colors.textMuted} style={{ marginBottom: 16 }} />
        <Text style={styles.infoTitle}>Caméra requise</Text>
        <Text style={styles.infoText}>L'accès à la caméra est nécessaire pour scanner les billets QR.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Autoriser la caméra</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.fill, styles.centered]}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={[styles.infoText, { marginTop: 12 }]}>Chargement des événements…</Text>
      </View>
    );
  }

  // ─── Main ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.fill}>
      {/* Camera */}
      {selectedEventId ? (
        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#111' }]} />
      )}

      {/* Top overlay */}
      <LinearGradient colors={['rgba(0,0,0,0.80)', 'transparent']} style={[styles.topOverlay, { paddingTop: insets.top + 14 }]}>
        <View style={styles.topRow}>
          <Text style={styles.screenTitle}>Scanner</Text>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: selectedEventId ? '#4ADE80' : '#9CA3AF' }]} />
            <Text style={styles.statusText}>{selectedEventId ? 'Prêt' : 'En attente'}</Text>
          </View>
        </View>
        {events.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsWrap}>
            {events.map(evt => (
              <TouchableOpacity
                key={evt.id}
                style={[styles.eventPill, selectedEventId === evt.id && styles.eventPillActive]}
                onPress={() => { setSelectedEventId(evt.id); Haptics.selectionAsync(); }}
              >
                <Text style={[styles.eventPillText, selectedEventId === evt.id && styles.eventPillTextActive]} numberOfLines={1}>
                  {evt.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.noEventText}>Aucun événement approuvé disponible</Text>
        )}
      </LinearGradient>

      {/* Scanner frame */}
      {selectedEventId && (
        <View style={styles.frameWrap} pointerEvents="none">
          <Animated.View style={[styles.frame, cornerAnim]}>
            <View style={[styles.corner, styles.cTL]} />
            <View style={[styles.corner, styles.cTR]} />
            <View style={[styles.corner, styles.cBL]} />
            <View style={[styles.corner, styles.cBR]} />
          </Animated.View>
          <Text style={styles.frameHint}>Centrez le QR code dans le cadre</Text>
        </View>
      )}

      {/* Bottom overlay */}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.bottomOverlay} pointerEvents="none" />

      {/* Result */}
      {scanResult && (
        <Animated.View
          style={[
            styles.resultCard,
            {
              backgroundColor:
                scanResult.type === 'valid' ? '#16A34A'
                : scanResult.type === 'used' ? '#D97706'
                : '#DC2626',
              bottom: insets.bottom + 80,
            },
            resultAnim,
          ]}
        >
          <Ionicons
            name={scanResult.type === 'valid' ? 'checkmark-circle' : scanResult.type === 'used' ? 'time' : 'close-circle'}
            size={40} color={colors.white} style={{ marginBottom: 6 }}
          />
          <Text style={styles.resultMsg}>{scanResult.message}</Text>
          {scanResult.eventName && <Text style={styles.resultSub}>{scanResult.eventName}</Text>}
        </Animated.View>
      )}
    </View>
  );
}

const FRAME = 230;
const CORNER = 22;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  infoCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 28,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border, maxWidth: 320,
  },
  infoTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 10 },
  infoText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  permBtn: { marginTop: 20, backgroundColor: colors.blue, paddingVertical: 13, paddingHorizontal: 28, borderRadius: 12 },
  permBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },

  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 16, zIndex: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  screenTitle: { fontSize: 22, fontWeight: '700', color: colors.white, letterSpacing: -0.3 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  statusText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  pillsWrap: { paddingHorizontal: 20, gap: 8 },
  eventPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', maxWidth: 180,
  },
  eventPillActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  eventPillText: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', fontSize: 13 },
  eventPillTextActive: { color: colors.white },
  noEventText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, paddingHorizontal: 20 },

  frameWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 8,
  },
  frame: { width: FRAME, height: FRAME, position: 'relative' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#FFFFFF', borderWidth: 3 },
  cTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 5 },
  cTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 5 },
  cBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 5 },
  cBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 5 },
  frameHint: { marginTop: 16, color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },

  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, zIndex: 5 },

  resultCard: {
    position: 'absolute', left: 20, right: 20,
    borderRadius: 18, padding: 22, alignItems: 'center', zIndex: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 18 },
      android: { elevation: 10 },
    }),
  },
  resultMsg: { color: colors.white, fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  resultSub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 6, textAlign: 'center' },
});
