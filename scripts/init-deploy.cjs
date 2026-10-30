// Creates local-only deployment credentials without printing them or replacing existing files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),target=path.join(root,'.env.deploy');
if(fs.existsSync(target))throw new Error('.env.deploy already exists; edit it deliberately instead of replacing credentials.');
const value=fs.readFileSync(path.join(root,'.env.deploy.example'),'utf8')
  .replace(/^POSTGRES_PASSWORD=$/m,'POSTGRES_PASSWORD='+crypto.randomBytes(32).toString('hex'))
  .replace(/^JWT_SECRET=$/m,'JWT_SECRET='+crypto.randomBytes(48).toString('hex'));
fs.writeFileSync(target,value,{mode:0o600,flag:'wx'});
console.log('Created ignored .env.deploy for loopback-only local deployment. No model credentials were enabled.');
