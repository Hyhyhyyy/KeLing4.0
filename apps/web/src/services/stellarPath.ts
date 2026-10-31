import { appPath } from './appPath';

/** Shared artwork uses WebP; the installable app icon remains PNG. */
export function stellarPath(name: string): string {
  return appPath(`/stellar/${name}.${name === 'app_icon' ? 'png' : 'webp'}`);
}
