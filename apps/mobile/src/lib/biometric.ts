import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { getItem, removeItem, setItem } from './storage';

const KEY = 'einfak_biometric_enabled';
const supported = Platform.OS !== 'web';

export async function biometricAvailable(): Promise<boolean> {
  if (!supported) return false;
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export async function biometricEnabled(): Promise<boolean> {
  return supported && (await getItem(KEY)) === '1';
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  if (on) await setItem(KEY, '1');
  else await removeItem(KEY);
}

export async function authenticate(): Promise<boolean> {
  if (!supported) return true;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'e-İnfak kilidini açın',
    cancelLabel: 'Vazgeç',
  });
  return result.success;
}
