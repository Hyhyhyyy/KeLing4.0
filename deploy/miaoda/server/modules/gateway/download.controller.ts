import { Controller, Get, Res } from '@nestjs/common';
import { FileService } from '@lark-apaas/fullstack-nestjs-core';
import type { Response } from 'express';

const APK_BUCKET: string = 'bucket_aadk4xawzf4xg';
const APK_PATH: string = '/1883007034146820.apk';
const APK_SHA256: string = '57eb2f8c189ed7d237ca83dff0191b07811f078dfd623a186610cd8c32a22d62';

@Controller('download')
export class DownloadController {
  constructor(private readonly files: FileService) {}

  @Get('android')
  async android(@Res() res: Response): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Sign only this published APK; callers cannot select private files or arbitrary paths.
      const signedUrl: string = await Promise.race([
        this.files.from(APK_BUCKET).createSignedUrl(APK_PATH, 3600),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Download link timeout')), 12_000);
        }),
      ]);
      const url: URL = new URL(signedUrl);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid storage URL');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-SHA256', APK_SHA256);
      // File storage serves the full object, without the application's request time limit.
      res.redirect(302, url.toString());
    } catch {
      res.status(503).json({ error: '安装包暂时无法下载，请稍后重试。' });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
