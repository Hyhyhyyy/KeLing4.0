import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

// Frozen only after the same APK is uploaded and its SHA-256 is verified on GitHub.
export const currentAndroidRelease = {
  versionCode: 30,
  versionName: '4.1.2-ai-rc3',
  updateUrl: 'https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/download/android',
  updateLog: '公共模型问答、计划与复盘；Android资料导师保存笔记与来源重开；网页资料样式与跨端图谱。',
  fileSize: 77490365,
  sha256: '9e7efe473df8f2f8b8b39d86ffa09fc582ea51c25e2966958dbcafe5bd529cd2',
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
