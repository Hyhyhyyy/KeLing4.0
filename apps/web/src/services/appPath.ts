// Keep navigation, public artwork and API calls within the deployed app prefix.
export const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const appPath = (path: string) => `${APP_BASE}${path}`;
const hosted = import.meta.env.VITE_HOSTING_PLATFORM === 'miaoda';
export const ANDROID_DOWNLOAD_URL = hosted ? appPath('/download/android') : 'https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/download/android';
export const hostingCredentials: RequestCredentials = hosted ? 'same-origin' : 'omit';
export function hostingHeaders(): Record<string, string> {
  if (!hosted) return {};
  const token = document.cookie.split('; ').find(value => value.startsWith('suda-csrf-token='))?.slice('suda-csrf-token='.length);
  return token ? { 'X-Suda-Csrf-Token': decodeURIComponent(token) } : {};
}
