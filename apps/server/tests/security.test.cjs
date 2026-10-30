require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {allowedCorsOrigins}=require('../src/config/security');
test('development accepts the loopback alias for the configured frontend port',()=>{
 const before={mode:process.env.NODE_ENV,origins:process.env.CORS_ORIGINS};
 try{
  process.env.NODE_ENV='development';process.env.CORS_ORIGINS='http://localhost:5173';
  assert.ok(allowedCorsOrigins().includes('http://127.0.0.1:5173'));
  assert.ok(!allowedCorsOrigins().includes('http://127.0.0.1:9999'));
  process.env.NODE_ENV='production';assert.deepEqual(allowedCorsOrigins(),['http://localhost:5173']);
 }finally{for(const [name,value] of [['NODE_ENV',before.mode],['CORS_ORIGINS',before.origins]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
