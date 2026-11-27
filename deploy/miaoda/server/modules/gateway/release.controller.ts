import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

// Frozen only after the same APK is uploaded and its SHA-256 is verified on GitHub.
export const currentAndroidRelease = {
  versionCode: 29,
  versionName: '4.1.1-graph-rc2',
  updateUrl: 'https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg/download/android',
  updateLog: '知识图谱自动排布、拖动与跨端保存；公共模型对话、资料问答、计划与复盘；普通课程和示例隔离。',
  fileSize: 78331402,
  sha256: 'ad3569e2fb5e930e9827ba30a9163da1c01c1cdf2d14359809a20f68dfc0ba48',
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
