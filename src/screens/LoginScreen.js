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
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) Alert.alert('Erreur de connexion', error.message);
    setLoading(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Top gradient accent */}
      <LinearGradient
        colors={colors.gradientHeader}
        style={styles.topAccent}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 20 : 0}
      >
        <View style={styles.center}>

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
            <Text style={styles.appSub}>Espace réservé aux scanners autorisés</Text>
          </Animated.View>

          {/* Card */}
          <Animated.View style={[styles.card, cardAnim]}>

            {/* Email */}
            <Text style={styles.inputLabel}>Adresse Email</Text>
            <View style={[styles.inputWrap, emailFocused && styles.inputFocused]}>
              <Ionicons name="mail-outline" size={18} color={emailFocused ? colors.blue : colors.textMuted} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.input}
                placeholder="organisateur@exemple.com"
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
            <View style={[styles.inputWrap, passwordFocused && styles.inputFocused]}>
              <Ionicons name="lock-closed-outline" size={18} color={passwordFocused ? colors.blue : colors.textMuted} style={{ marginRight: 10 }} />
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
                style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                onPress={handleLogin}
                onPressIn={() => { btnScale.value = withSpring(0.97, { damping: 15, stiffness: 300 }); }}
                onPressOut={() => { btnScale.value = withSpring(1, { damping: 15, stiffness: 300 }); }}
                disabled={loading}
                activeOpacity={1}
              >
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.loginBtnText}>Se connecter</Text>
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
  appSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },

  card: {
    backgroundColor: colors.white, borderRadius: 20, padding: 22,
    borderWidth: 1, borderColor: colors.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 5 },
    }),
  },
  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 7 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    backgroundColor: colors.background,
  },
  inputFocused: { borderColor: colors.blue, backgroundColor: colors.bluePale },
  input: { flex: 1, fontSize: 15, color: colors.text },

  loginBtn: {
    backgroundColor: colors.blue, paddingVertical: 15, borderRadius: 13,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: colors.blue, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },

  footer: { alignItems: 'center', marginTop: 28 },
  footerText: { color: colors.textMuted, fontSize: 12 },
});
