import { Platform } from 'react-native';

// Prefer EXPO_PUBLIC_API_URL when set (device / LAN). Emulator default: 10.0.2.2
const envUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const fallback = `http://${host}:3000`;

export const API_ORIGIN = envUrl || fallback;
export const API_BASE_URL = `${API_ORIGIN}/api`;
export const WS_URL = `${API_ORIGIN}/realtime`;
