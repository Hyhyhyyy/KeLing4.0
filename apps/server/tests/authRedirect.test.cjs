require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');const vm=require('node:vm');
const output=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../web/src/services/authRedirect.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{}};vm.runInNewContext(output,context);const {shouldRedirectToLogin}=context.exports;
test('bad login credentials keep the form visible; expired protected sessions redirect',()=>{
 assert.equal(shouldRedirectToLogin(401,'/auth/login'),false);
 assert.equal(shouldRedirectToLogin(401,'/auth/register'),false);
 assert.equal(shouldRedirectToLogin(401,'/courses'),true);
 assert.equal(shouldRedirectToLogin(429,'/auth/login'),false);
});
