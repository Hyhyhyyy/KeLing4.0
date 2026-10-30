require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {releaseInfo,latestReleaseInfo}=require('../src/services/release');
test('release uses actual Android code and never invents an APK or version on missing metadata',()=>{
 const release={tag_name:'v3.1.0',body:'改进规划\n<!-- keling-version-code: 9 -->',published_at:'2026-10-28T00:00:00Z',html_url:'https://github.com/CurryHeng/KeLing_ICT/releases/tag/v3.1.0',assets:[{name:'KeLing.apk',size:12345,browser_download_url:'https://github.com/CurryHeng/KeLing_ICT/releases/download/v3.1.0/KeLing.apk'}]};
 const info=releaseInfo(release);assert.equal(info.versionCode,9);assert.equal(info.versionName,'3.1.0');assert.equal(info.updateLog,'改进规划');
 assert.throws(()=>releaseInfo({...release,assets:[]}));assert.throws(()=>releaseInfo({...release,body:'无版本编号'}));
 assert.throws(()=>releaseInfo({...release,assets:[{...release.assets[0],browser_download_url:'http://example.test/app.apk'}]}));
});
test('preview release discovery chooses a published APK by actual Android code and ignores drafts',()=>{
 const make=(code,extra={})=>({tag_name:`v3.2.${code}-preview`,body:`Preview\n<!-- keling-version-code: ${code} -->`,published_at:'2026-10-30T00:00:00Z',html_url:'https://github.com/Hyhyhyyy/KeLing4.0/releases',assets:[{name:'KeLing.apk',size:12345,browser_download_url:'https://github.com/Hyhyhyyy/KeLing4.0/releases/download/preview/KeLing.apk'}],...extra});
 assert.equal(latestReleaseInfo([make(99,{draft:true}),make(15,{assets:[]}),make(13),make(14,{prerelease:true})]).versionCode,14);
 assert.throws(()=>latestReleaseInfo([]));
 assert.throws(()=>latestReleaseInfo([make(99,{draft:true}),make(14,{assets:[]})]));
});
