import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

// Frozen only after the same APK is uploaded and its SHA-256 is verified on GitHub.
export const currentAndroidRelease = {
  versionCode: 31,
  versionName: '4.2.0-journey-rc1',
  updateUrl: 'https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/download/android',
  updateLog: '课灵启航故事；十套个人形象、头像框与称号；十项成就家具；打卡、计时与学习日历跨端同步。',
  fileSize: 85638827,
  sha256: '57eb2f8c189ed7d237ca83dff0191b07811f078dfd623a186610cd8c32a22d62',
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
