import { Controller, Get, Res } from '@nestjs/common';
import { FileService } from '@lark-apaas/fullstack-nestjs-core';
import type { Response } from 'express';

const APK_BUCKET: string = 'bucket_aadk4xawzf4xg';
const APK_PATH: string = '/1882980283768928.apk';
const APK_SHA256: string = 'ad3569e2fb5e930e9827ba30a9163da1c01c1cdf2d14359809a20f68dfc0ba48';

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
