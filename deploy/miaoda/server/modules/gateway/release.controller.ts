import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

// Frozen only after the same APK is uploaded and its SHA-256 is verified on GitHub.
export const currentAndroidRelease = {
  versionCode: 33,
  versionName: '4.3.1-research-rc2',
  updateUrl: 'https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/download/android',
  updateLog: '联网材料驱动学习；逐题相似碎片与星芽提示；内容复核；角色参考图塑造星球；移动图谱适配。',
  fileSize: 85758314,
  sha256: '889ac6559f1398037a67013de1f80c15e0ec1f18412194119804672dbfc198c2',
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
