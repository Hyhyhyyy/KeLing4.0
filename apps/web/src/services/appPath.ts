// Keep navigation, public artwork and API calls within the deployed app prefix.
export const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const appPath = (path: string) => `${APP_BASE}${path}`;
const hosted = import.meta.env.VITE_HOSTING_PLATFORM === 'miaoda';
export const ANDROID_DOWNLOAD_URL = hosted ? appPath('/download/android') : 'https://github.com/Hyhyhyyy/KeLing4.0/releases/download/v4.0.4-direct-cloud-preview/KeLing-ICT-4.0.4-direct-cloud-debug.apk';
export const hostingCredentials: RequestCredentials = hosted ? 'same-origin' : 'omit';
export function hostingHeaders(): Record<string, string> {
  if (!hosted) return {};
  const token = document.cookie.split('; ').find(value => value.startsWith('suda-csrf-token='))?.slice('suda-csrf-token='.length);
  return token ? { 'X-Suda-Csrf-Token': decodeURIComponent(token) } : {};
}
