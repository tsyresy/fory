import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withDelay, withSequence, Easing,
} from 'react-native-reanimated';
import { colors } from '../../theme/colors';

function Dot({ delay }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 400, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      )
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: 0.8 + opacity.value * 0.4 }],
  }));

  return <Animated.View style={[styles.dot, animStyle]} />;
}

export default function TypingIndicator({ users = [] }) {
  if (!users || users.length === 0) return null;

  const names = users.map(u => u.userName || 'Quelqu\'un').slice(0, 3);
  let label;
  if (names.length === 1) {
    label = `${names[0]} écrit`;
  } else if (names.length === 2) {
    label = `${names[0]} et ${names[1]} écrivent`;
  } else {
    label = `${names[0]} et ${names.length - 1} autres écrivent`;
  }

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <View style={styles.dotsRow}>
          <Dot delay={0} />
          <Dot delay={150} />
          <Dot delay={300} />
        </View>
      </View>
      <Text style={styles.label}>{label}…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  bubble: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.textMuted,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    fontStyle: 'italic',
    marginLeft: 8,
  },
});
