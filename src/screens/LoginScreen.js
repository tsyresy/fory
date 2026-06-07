import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  Alert, StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';

export default function LoginScreen() {
  const { setStaffMode } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isStaffMode, setIsStaffMode] = useState(false);

  const logoOpacity = useSharedValue(0);
  const logoY = useSharedValue(-20);
  const cardOpacity = useSharedValue(0);
  const cardY = useSharedValue(30);
  const btnScale = useSharedValue(1);

  useEffect(() => {
    logoOpacity.value = withDelay(100, withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) }));
    logoY.value = withDelay(100, withSpring(0, { damping: 18, stiffness: 120 }));
    cardOpacity.value = withDelay(280, withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) }));
    cardY.value = withDelay(280, withSpring(0, { damping: 20, stiffness: 130 }));
  }, []);

  const logoAnim = useAnimatedStyle(() => ({ opacity: logoOpacity.value, transform: [{ translateY: logoY.value }] }));
  const cardAnim = useAnimatedStyle(() => ({ opacity: cardOpacity.value, transform: [{ translateY: cardY.value }] }));
  const btnAnim = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert('Erreur', 'Veuillez remplir tous les champs.'); return; }

    if (isStaffMode) {
      if (!staffCode.trim()) { Alert.alert('Erreur', 'Veuillez entrer le code d\'accès événement.'); return; }
      await handleStaffLogin();
    } else {
      await handleOrganizerLogin();
    }
  };

  const handleOrganizerLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) Alert.alert('Erreur de connexion', error.message);
    setLoading(false);
  };

  const handleStaffLogin = async () => {
    setLoading(true);
    try {
      // 1. Verify the staff code exists and get the event
      const code = staffCode.trim().toUpperCase();
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, title, organizer_id, status, end_date')
        .eq('staff_code', code)
        .single();

      if (eventError || !event) {
        Alert.alert('Code invalide', 'Ce code d\'accès événement n\'existe pas. Vérifiez auprès de votre organisateur.');
        setLoading(false);
        return;
      }

      // Check event is active
      if (!['approved', 'published'].includes(event.status)) {
        Alert.alert('Événement inactif', 'Cet événement n\'est plus actif. Le code d\'accès n\'est plus valide.');
        setLoading(false);
        return;
      }

      // Check event has not ended (end_date passed)
      if (event.end_date && new Date(event.end_date) < new Date()) {
        Alert.alert('Événement terminé', 'Cet événement est terminé. Le code d\'accès staff n\'est plus valide.');
        setLoading(false);
        return;
      }

      // 2. Sign in the user
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        Alert.alert('Erreur de connexion', authError.message);
        setLoading(false);
        return;
      }

      const userId = authData.user.id;

      // 3. Prevent the organizer from joining as staff on their own event
      if (event.organizer_id === userId) {
        Alert.alert('Action impossible', 'Vous êtes l\'organisateur de cet événement. Connectez-vous en mode Organisateur.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // 4. Check if already in event_staff and status
      const { data: existing } = await supabase
        .from('event_staff')
        .select('id, status')
        .eq('event_id', event.id)
        .eq('user_id', userId)
        .single();

      if (existing) {
        if (existing.status === 'suspended') {
          Alert.alert('Accès suspendu', 'Votre accès à cet événement a été suspendu par l\'organisateur.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
        // Already active — just set staff mode
      } else {
        // 5. Insert new staff entry
        const { error: insertError } = await supabase
          .from('event_staff')
          .insert({ event_id: event.id, user_id: userId, status: 'active' });

        if (insertError) {
          console.error('Staff insert error:', insertError);
          Alert.alert('Erreur', 'Impossible de rejoindre l\'événement. Réessayez.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      }

      // 6. Set staff mode in store
      setStaffMode(event.id, event.title);

    } catch (err) {
      console.error('Staff login error:', err);
      Alert.alert('Erreur', 'Une erreur inattendue est survenue.');
    }
    setLoading(false);
  };

  const toggleMode = () => {
    setIsStaffMode(prev => !prev);
    setStaffCode('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Top gradient accent */}
      <LinearGradient
        colors={isStaffMode ? ['#7C3AED', '#A855F7'] : colors.gradientHeader}
        style={styles.topAccent}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 20 : 0}
      >
        <View style={[styles.center, { paddingTop: insets.top + 12 }]}>

          {/* Mode toggle — top right */}
          <Animated.View style={[styles.modeToggleWrap, cardAnim]}>
            <TouchableOpacity
              style={[
                styles.modeToggle,
                isStaffMode && styles.modeToggleStaff,
              ]}
              onPress={toggleMode}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isStaffMode ? 'person-outline' : 'people-outline'}
                size={14}
                color={isStaffMode ? '#7C3AED' : colors.blue}
                style={{ marginRight: 5 }}
              />
              <Text style={[
                styles.modeToggleText,
                isStaffMode && styles.modeToggleTextStaff,
              ]}>
                {isStaffMode ? 'STAFF' : 'ORGANISATEUR'}
              </Text>
              <Ionicons
                name="swap-horizontal"
                size={13}
                color={isStaffMode ? '#7C3AED' : colors.blue}
                style={{ marginLeft: 5 }}
              />
            </TouchableOpacity>
          </Animated.View>

          {/* Logo */}
          <Animated.View style={[styles.logoWrap, logoAnim]}>
            <View style={styles.logoBox}>
              <Image
                source={require('../../assets/brand/home-logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.appTitle}>Tapakeel Scanner</Text>
            <Text style={styles.appSub}>
              {isStaffMode
                ? 'Connexion Staff — Entrez votre code d\'accès'
                : 'Espace réservé aux scanners autorisés'}
            </Text>
          </Animated.View>

          {/* Card */}
          <Animated.View style={[styles.card, cardAnim]}>

            {/* Staff mode badge */}
            {isStaffMode && (
              <View style={styles.staffBadgeBanner}>
                <Ionicons name="people" size={16} color="#7C3AED" style={{ marginRight: 6 }} />
                <Text style={styles.staffBadgeText}>Mode Staff</Text>
              </View>
            )}

            {/* Staff code field — only in staff mode */}
            {isStaffMode && (
              <>
                <Text style={styles.inputLabel}>Code d'accès événement</Text>
                <View style={[styles.inputWrap, codeFocused && styles.inputFocusedStaff]}>
                  <Ionicons name="key-outline" size={18} color={codeFocused ? '#7C3AED' : colors.textMuted} style={{ marginRight: 10 }} />
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="TK-XXXX"
                    placeholderTextColor={colors.textMuted}
                    value={staffCode}
                    onChangeText={(text) => setStaffCode(text.toUpperCase())}
                    autoCapitalize="characters"
                    returnKeyType="next"
                    maxLength={7}
                    onFocus={() => setCodeFocused(true)}
                    onBlur={() => setCodeFocused(false)}
                  />
                </View>
              </>
            )}

            {/* Email */}
            <Text style={[styles.inputLabel, isStaffMode && { marginTop: 14 }]}>Adresse Email</Text>
            <View style={[styles.inputWrap, emailFocused && (isStaffMode ? styles.inputFocusedStaff : styles.inputFocused)]}>
              <Ionicons name="mail-outline" size={18} color={emailFocused ? (isStaffMode ? '#7C3AED' : colors.blue) : colors.textMuted} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.input}
                placeholder={isStaffMode ? 'votre@email.com' : 'organisateur@exemple.com'}
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>

            {/* Password */}
            <Text style={[styles.inputLabel, { marginTop: 14 }]}>Mot de passe</Text>
            <View style={[styles.inputWrap, passwordFocused && (isStaffMode ? styles.inputFocusedStaff : styles.inputFocused)]}>
              <Ionicons name="lock-closed-outline" size={18} color={passwordFocused ? (isStaffMode ? '#7C3AED' : colors.blue) : colors.textMuted} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={{ padding: 2 }}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Button */}
            <Animated.View style={[{ marginTop: 22 }, btnAnim]}>
              <TouchableOpacity
                style={[
                  styles.loginBtn,
                  isStaffMode && styles.loginBtnStaff,
                  loading && styles.loginBtnDisabled,
                ]}
                onPress={handleLogin}
                onPressIn={() => { btnScale.value = withSpring(0.97, { damping: 15, stiffness: 300 }); }}
                onPressOut={() => { btnScale.value = withSpring(1, { damping: 15, stiffness: 300 }); }}
                disabled={loading}
                activeOpacity={1}
              >
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <View style={styles.btnContent}>
                    {isStaffMode && (
                      <Ionicons name="people" size={18} color={colors.white} style={{ marginRight: 8 }} />
                    )}
                    <Text style={styles.loginBtnText}>
                      {isStaffMode ? 'Rejoindre en tant que Staff' : 'Se connecter'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>

          <Animated.View style={[styles.footer, cardAnim]}>
            <Text style={styles.footerText}>© 2026 Tapakeel — Plateforme de billetterie</Text>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topAccent: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 200, borderBottomLeftRadius: 30, borderBottomRightRadius: 30,
  },
  center: {
    flex: 1, justifyContent: 'center',
    paddingHorizontal: 24, paddingBottom: 32,
  },

  // Mode toggle
  modeToggleWrap: {
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bluePale,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.blueBorder,
  },
  modeToggleStaff: {
    backgroundColor: '#EDE9FE',
    borderColor: '#C4B5FD',
  },
  modeToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.blue,
    letterSpacing: 0.5,
  },
  modeToggleTextStaff: {
    color: '#7C3AED',
  },

  logoWrap: { alignItems: 'center', marginBottom: 28 },
  logoBox: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: colors.white, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  logo: { width: 68, height: 68 },
  appTitle: { fontSize: 24, fontWeight: '700', color: colors.white, letterSpacing: -0.3, marginBottom: 5 },
  appSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },

  card: {
    backgroundColor: colors.white, borderRadius: 20, padding: 22,
    borderWidth: 1, borderColor: colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 5 },
    }),
  },

  // Staff badge banner
  staffBadgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C4B5FD',
  },
  staffBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C3AED',
  },

  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 7 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    backgroundColor: colors.background,
  },
  inputFocused: { borderColor: colors.blue, backgroundColor: colors.bluePale },
  inputFocusedStaff: { borderColor: '#7C3AED', backgroundColor: '#F5F3FF' },
  input: { flex: 1, fontSize: 15, color: colors.text },
  codeInput: { fontWeight: '700', letterSpacing: 2, fontSize: 17 },

  loginBtn: {
    backgroundColor: colors.blue, paddingVertical: 15, borderRadius: 13,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: colors.blue, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  loginBtnStaff: {
    backgroundColor: '#7C3AED',
    ...Platform.select({
      ios: { shadowColor: '#7C3AED' },
      android: {},
    }),
  },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  btnContent: { flexDirection: 'row', alignItems: 'center' },

  footer: { alignItems: 'center', marginTop: 28 },
  footerText: { color: colors.textMuted, fontSize: 12 },
});
