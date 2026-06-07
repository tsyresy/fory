// Shared SHA-256 hash function for PIN verification
// Uses expo-crypto which works on both iOS and Android
import * as Crypto from 'expo-crypto';

/**
 * Hash a PIN string using SHA-256 (compatible with the web version)
 * The web version uses crypto.subtle.digest which produces the same output.
 * @param {string} pin - The PIN to hash
 * @returns {Promise<string>} - The hex-encoded SHA-256 hash
 */
export async function hashPin(pin) {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin
  );
  return hash;
}
