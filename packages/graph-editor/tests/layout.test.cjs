const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),esbuild=require('esbuild');
const code=esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../src/model.ts')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const exportsObject={},context={module:{exports:exportsObject},exports:exportsObject,require,console,structuredClone};vm.runInNewContext(code,context);const api=context.module.exports;
const node=(id,parents=[])=>({id,name:'英语知识 '+id,description:'学习表达与应用',parentIds:parents,masteryLevel:0,difficulty:2,positionX:.5,positionY:.5});
const input=nodes=>({courseId:'english',sessionId:'session',nodes,layoutSaved:false,savedNodeIds:[]});
test('directed multi-parent graph keeps every relation and lays out distinct nonoverlapping cards',()=>{
 const nodes=[node('root'),node('greet',['root']),node('name',['root']),node('dialog',['greet','name']),node('self',['dialog'])];
 const edges=api.graphEdges(nodes),layout=api.automaticLayout(nodes);assert.equal(edges.length,5);assert.equal(layout.positions.length,5);
 for(const p of layout.positions){assert.ok(p.positionX>0&&p.positionX<1);assert.ok(p.positionY>0&&p.positionY<1);}
 for(const edge of edges){const a=layout.positions.find(p=>p.id===edge.source),b=layout.positions.find(p=>p.id===edge.target);assert.ok(b.positionX>a.positionX);}
 for(let i=0;i<layout.positions.length;i++)for(let j=i+1;j<layout.positions.length;j++){const a=layout.positions[i],b=layout.positions[j];assert.ok(Math.abs(a.positionX-b.positionX)*4096>=api.CARD.width*layout.scale||Math.abs(a.positionY-b.positionY)*4096>=api.CARD.height*layout.scale);}
});
test('cycles, disconnected nodes and missing parent references remain visible without fabricated edges',()=>{
 const nodes=[node('a',['b']),node('b',['a']),node('solo',['missing'])];const layout=api.automaticLayout(nodes);assert.equal(layout.positions.length,3);assert.equal(api.graphEdges(nodes).length,2);assert.ok(layout.positions.every(p=>Number.isFinite(p.positionX)&&Number.isFinite(p.positionY)));
});
test('explicit saved positions survive adding a new node; single center node remains saved data',()=>{
 const a=node('a');a.positionX=.5;a.positionY=.5;const payload={...input([a,node('b',['a'])]),savedNodeIds:['a']};
 const layout=api.initialLayout(payload);assert.equal(layout.positions.find(p=>p.id==='a').positionX,.5);assert.equal(layout.positions.find(p=>p.id==='a').positionY,.5);assert.notEqual(api.positionFingerprint(layout.positions),api.positionFingerprint([a]));
 const one=api.initialLayout({...input([a]),layoutSaved:true});assert.equal(one.positions[0].positionX,.5);assert.equal(one.positions[0].positionY,.5);
});
test('500-node layout remains finite inside fixed logical bounds and round trips normalized centers',()=>{
 const nodes=Array.from({length:500},(_,i)=>node('node-'+String(i).padStart(3,'0'),i?['node-'+String(Math.floor((i-1)/4)).padStart(3,'0')]:[]));
 const layout=api.automaticLayout(nodes);assert.equal(layout.positions.length,500);assert.ok(layout.positions.every(p=>p.positionX>=0&&p.positionX<=1&&p.positionY>=0&&p.positionY<=1));
 const p=layout.positions[233],width=api.CARD.width*layout.scale,height=api.CARD.height*layout.scale;const result=api.normalizedPosition(p.id,p.positionX*4096-width/2,p.positionY*4096-height/2,width,height);assert.equal(api.positionFingerprint([p]),api.positionFingerprint([result]));
});
test('bridge validation keeps only diagram fields and rejects duplicate IDs',()=>{
 const p=api.validateGraphInput({...input([node('a')]),token:'private',nodes:[{...node('a'),apiKey:'private'}]});assert.equal(p.token,undefined);assert.equal(p.nodes[0].apiKey,undefined);assert.throws(()=>api.validateGraphInput(input([node('a'),node('a')])),/重复/);
});
