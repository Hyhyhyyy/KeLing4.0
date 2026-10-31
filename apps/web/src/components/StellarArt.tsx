import { appPath } from '../services/appPath';
import type { CSSProperties } from 'react';
export function StellarSprite({ atlas, index, size = 48, label }: { atlas: 'avatars' | 'subjects' | 'modules'; index: number; size?: number; label?: string }) {
  const n = Math.max(0, Math.min(8, index));
  const style: CSSProperties = { display: 'inline-block', flexShrink: 0, width: size, height: size, backgroundImage: `url(${appPath('/stellar/')}${atlas}.png)`, backgroundSize: '300% 300%', backgroundPosition: `${n % 3 * 50}% ${Math.floor(n / 3) * 50}%`, imageRendering: 'pixelated' };
  return <span style={style} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
