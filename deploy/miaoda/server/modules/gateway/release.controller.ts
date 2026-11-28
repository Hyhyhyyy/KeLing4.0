import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

// Frozen only after the same APK is uploaded and its SHA-256 is verified on GitHub.
export const currentAndroidRelease = {
  versionCode: 34,
  versionName: '4.3.2-progress-rc1',
  updateUrl: 'https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/download/android',
  updateLog: '星图与学习星球使用同一形象，重绘后同步；生成过程显示实际阶段与持续动画；优化等待过程，保留原有绘图质量与内容核对。',
  fileSize: 85236835,
  sha256: 'e93e055ce99289e308079a84057284a170f6c5db280fee19d1bfba2f3a607549',
};

@Controller('api/app')
export class ReleaseController {
  @Get('version')
  version(@Query('versionCode') rawCode: string, @Query('versionName') rawName: string, @Res() res: Response): void {
    const parsed = Number.parseInt(rawCode, 10);
    const versionCode = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, currentVersion: { versionCode, versionName: rawName || '0.0.0' },
      latestVersion: currentAndroidRelease, needUpdate: versionCode < currentAndroidRelease.versionCode, forceUpdate: false });
  }

  @Get('download')
  download(@Res() res: Response): void {
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, currentAndroidRelease.updateUrl);
  }
}
