export interface Release {
  tag_name:string;body:string|null;published_at:string;html_url:string;
  draft?:boolean;prerelease?:boolean;
  assets:{name:string;browser_download_url:string;size:number}[];
}

/** Preview builds are published as GitHub prereleases, excluded by /releases/latest. */
export function latestReleaseInfo(releases: Release[]) {
  if (!Array.isArray(releases)) throw new Error('Release 目录格式无效');
  const available = releases.filter(release => !release.draft).flatMap(release => {
    try { return [releaseInfo(release)]; } catch { return []; }
  }).sort((a, b) => b.versionCode - a.versionCode);
  if (!available.length) throw new Error('暂未发布含有效 APK 的版本');
  return available[0];
}

/** Android versionCode is an independent integer, not the digits of versionName. */
export function releaseInfo(release:Release){
  const apk=release.assets.find(a=>a.name.endsWith('.apk'));
  const code=Number(release.body?.match(/<!--\s*keling-version-code:\s*(\d+)\s*-->/)?.[1]);
  if(!apk||!Number.isSafeInteger(code)||code<1||apk.size<1)throw new Error('Release 缺少 APK 或真实 versionCode');
  const url=new URL(apk.browser_download_url);
  if(url.protocol!=='https:'||url.hostname!=='github.com')throw new Error('Release 下载地址无效');
  return {versionCode:code,versionName:release.tag_name.replace(/^v/,''),minVersionCode:1,updateUrl:apk.browser_download_url,
    updateLog:(release.body||'').replace(/<!--\s*keling-version-code:\s*\d+\s*-->/,'').trim(),
    forceUpdate:false,fileSize:apk.size,releaseDate:release.published_at,htmlUrl:release.html_url};
}
