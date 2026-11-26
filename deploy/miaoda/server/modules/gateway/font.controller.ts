import { Controller, Get, Inject, Logger, Req, Res } from '@nestjs/common';
import { FileService } from '@lark-apaas/fullstack-nestjs-core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

const FONT_BUCKET: string = 'bucket_aadk4xawzf4xg';
const FONT_PATH: string = '/1882832924311610.woff2';
const FONT_SHA256: string = '0451629e411c5b66319cd1558adb59eb9e0660fe07c5537ec7356254823a61c5';
const FONT_BYTES: number = 6054636;

/** Serves the one licensed public font; callers cannot select storage objects. */
@Controller('fonts')
export class FontController {
  private readonly logger: Logger = new Logger(FontController.name);
  private cachedFont?: Buffer;
  private loadingFont?: Promise<Buffer>;

  constructor(@Inject(FileService) private readonly files: FileService) {}

  private async downloadFont(): Promise<Buffer> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async (): Promise<Buffer> => {
          const result = await this.files.from(FONT_BUCKET).download(FONT_PATH);
          if (result.content.size !== FONT_BYTES) throw new Error('Unexpected font size');
          const buffer: Buffer = Buffer.from(await result.content.arrayBuffer());
          if (buffer.subarray(0, 4).toString('ascii') !== 'wOF2'
            || createHash('sha256').update(buffer).digest('hex') !== FONT_SHA256) {
            throw new Error('Font integrity check failed');
          }
          return buffer;
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Font download timeout')), 15_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private loadFont(): Promise<Buffer> {
    if (this.cachedFont) return Promise.resolve(this.cachedFont);
    if (!this.loadingFont) {
      this.loadingFont = this.downloadFont().then((buffer: Buffer) => {
        this.cachedFont = buffer;
        return buffer;
      }).finally(() => { this.loadingFont = undefined; });
    }
    return this.loadingFont;
  }

  @Get('STZHONGS.woff2')
  async font(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const buffer: Buffer = await this.loadFont();
      const etag: string = `"${FONT_SHA256}"`;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('ETag', etag);
      res.setHeader('X-Content-SHA256', FONT_SHA256);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.fresh || req.headers['if-none-match']?.split(',').some((value: string) => value.trim().replace(/^W\//, '') === etag)) {
        res.status(304).end();
        return;
      }
      res.setHeader('Content-Type', 'font/woff2');
      res.setHeader('Content-Length', buffer.length);
      res.status(200).end(buffer);
    } catch (error: unknown) {
      this.logger.warn('Public font unavailable', error instanceof Error ? error.stack : String(error));
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({ error: '字体暂时无法加载' });
    }
  }
}
