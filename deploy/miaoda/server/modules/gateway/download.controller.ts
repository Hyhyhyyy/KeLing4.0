import { Controller, Get, Res } from '@nestjs/common';
import { FileService } from '@lark-apaas/fullstack-nestjs-core';
import type { Response } from 'express';

const APK_BUCKET: string = 'bucket_aadk4xawzf4xg';
const APK_PATH: string = '/1883111334116376.apk';
const APK_SHA256: string = 'e93e055ce99289e308079a84057284a170f6c5db280fee19d1bfba2f3a607549';

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
