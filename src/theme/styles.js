import { StyleSheet, Platform } from 'react-native';
import { colors } from './colors';

export const globalStyles = StyleSheet.create({
  // Containers
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  cardFlat: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Typography
  screenTitle: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 },
  text: { fontSize: 15, color: colors.text, lineHeight: 22 },
  textMuted: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },

  // Buttons
  button: {
    backgroundColor: colors.blue,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: colors.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  buttonOutline: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOutlineText: { color: colors.blue, fontWeight: '600', fontSize: 15 },
  buttonDanger: {
    backgroundColor: colors.red,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSuccess: {
    backgroundColor: colors.green,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Misc
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  spaceBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  glassCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
