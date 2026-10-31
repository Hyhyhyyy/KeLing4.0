import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { resolve, extname, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { app as keling } from '../../../vendor/keling-server.cjs';

export function hostedPath(path: string, base: string): string {
  const prefix: string = base.replace(/\/$/, '');
  const relative: string = prefix && (path === prefix || path.startsWith(prefix + '/')) ? path.slice(prefix.length) || '/' : path;
  const decoded: string = decodeURIComponent(relative);
  if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').includes('..')) throw new Error('Invalid path');
  return decoded;
}

@Injectable()
export class GatewayService {
  async forward(req: Request, res: Response): Promise<void> {
    const base: string = process.env.CLIENT_BASE_PATH || '/app/app_17h4dw5jwdg';
    let pathname: string;
    try { pathname = hostedPath(req.path, base); }
    catch { res.status(400).json({ error: '请求路径无效' }); return; }
    res.setHeader('X-Keling-Hosting', 'miaoda-direct-v1');
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const query: string = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      req.url = pathname + query;
      // Existing KeLing routes validate the account JWT; platform cookies confer no account access.
      await new Promise<void>((done) => {
        const finish: () => void = () => { res.off('finish', finish); res.off('close', finish); done(); };
        res.once('finish', finish); res.once('close', finish);
        keling(req, res, () => { if (!res.headersSent) res.status(404).json({ error: '接口不存在' }); });
      });
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.status(405).json({ error: '不支持此请求方法' }); return; }
    const root: string = resolve(__dirname, '../../../vendor/web');
    const file: string = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep) && file !== root) { res.status(400).end(); return; }
    if (extname(pathname) && existsSync(file)) { res.setHeader('Cache-Control', 'public, max-age=3600'); res.sendFile(file); return; }
    if (extname(pathname)) { res.status(404).end(); return; }
    // The platform already supplies its root-scoped CSRF cookie. Remove the
    // obsolete scoped cookie so root navigation and API requests use one value.
    res.clearCookie('suda-csrf-token', { path: base.replace(/\/$/, '') + '/', secure: true, sameSite: 'lax' });
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(resolve(root, 'index.html'));
  }
}
