import * as Crypto from 'expo-crypto';

/** RN has no global crypto.randomUUID, so go through expo-crypto. */
export function newId(): string {
  return Crypto.randomUUID();
}
