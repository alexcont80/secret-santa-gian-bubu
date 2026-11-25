import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { appFor } from '../server.mjs';
import { draw, classifyLocal, initial } from '../domain.mjs';

test('matching randomizzato, esclusioni e caso impossibile',()=>{
  const people=Array.from({length:20},(_,i)=>String(i));
  const exclusions=[['0','3'],['3','0'],['4','5']];
  for(let i=0;i<30;i++){
    const result=draw(people,exclusions);
    assert.equal(new Set(Object.values(result)).size,20);
    assert.ok(people.every(id=>result[id]!==id));
    assert.ok(exclusions.every(([x,y])=>result[x]!==y));
  }
  assert.throws(()=>draw(['a','b'],[['a','b']]), /non esiste/);
  assert.deepEqual(classifyLocal('lasagne, vino e tiramisù').map(x=>x.category),['Primi','Bevande','Dolci']);
});

test('persistenza, codici, concorrenza, voti e moderazione',async t=>{
  const root=await mkdtemp(join(tmpdir(),'santa-api-'));
  const cfg={mode:process.env.FIRESTORE_EMULATOR_HOST?'firestore':'sqlite',project:'demo-secret-santa',dbPath:join(root,'test.sqlite'),
    key:randomBytes(32).toString('hex'),guest:'test-party-guest',admin:'test-admin',adminPassword:'test-admin-strong-password',secure:false};
  const {app,store}=await appFor(cfg);
  if (cfg.mode==='firestore') {
    await store.mutate(s=>Object.assign(s,initial()));
  }
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.close?.();await rm(root,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port+'/api';
  function session() {
    let cookie='';
    return async(method,path,data,expected=200)=>{
      const headers={'x-party':'1'};
      if(cookie) headers.cookie=cookie;
      if(data instanceof Buffer) headers['content-type']='image/png';
      else if(data!==undefined) headers['content-type']='application/json';
      const response=await fetch(base+path,{method,headers,body:data instanceof Buffer?data:data===undefined?undefined:JSON.stringify(data)});
      const received=response.headers.get('set-cookie');
      if(received)cookie=received.split(';')[0];
      const result=response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer());
      assert.equal(response.status,expected,JSON.stringify(result));
      return result;
    };
  }
  const anonymous=session(), a=session(), b=session(), admin=session(), companion=session();
  const login=client=>client('POST','/login',{password:cfg.guest});
  await anonymous('GET','/state',undefined,401);
  await Promise.all([login(a),login(b),login(companion),admin('POST','/login',{admin:true,name:cfg.admin,password:cfg.adminPassword})]);
  const [alice,bob]=await Promise.all([
    a('POST','/rsvp',{first:'Alice',last:'Prova',status:'Ci sono',companion:'Chiara Prova',bring:'lasagne e prosecco'}),
    b('POST','/rsvp',{first:'Bob',last:'Prova',status:'Ci sono',bring:'panettone'})
  ]);
  const state=await b('GET','/state');
  assert.equal(state.stats.confirmed,3);
  assert.equal(state.people.find(p=>p.first==='Alice').food.length,2);
  assert.ok(!JSON.stringify(state).includes(alice.personalCode));
  await a('POST','/rsvp',{first:'Alice',last:'Prova',status:'Ci sono',companion:'Chiara Prova',bring:'vino',version:0},409);
  const ca=await companion('POST','/restore',{code:alice.companionCode});
  assert.equal(ca.first,'Chiara Prova');
  await b('POST','/admin/draw',{confirm:true},403);
  const ap=state.people.find(p=>p.first==='Alice'), bp=state.people.find(p=>p.first==='Bob');
  await admin('POST','/admin/exclusions',{pairs:[[ap.id,bp.id]]});
  await admin('POST','/admin/draw',{confirm:true});
  await admin('POST','/admin/draw',{confirm:true},409);
  const outcomes=await Promise.all([a('POST','/match',{code:alice.personalCode}),b('POST','/match',{code:bob.personalCode}),companion('POST','/match',{code:alice.companionCode})]);
  assert.deepEqual(outcomes[0],{recipient:'Chiara Prova'});
  assert.equal(new Set(outcomes.map(x=>x.recipient)).size,3);
  await anonymous('POST','/match',{code:alice.personalCode},401);
  await a('GET','/matches',undefined,404);
  const exportData=await admin('GET','/admin/export');
  assert.ok(!Object.hasOwn(exportData,'matches'));
  const song=await a('POST','/songs',{title:'Carol',artist:'Test'},201);
  await Promise.all([a('PUT','/songs/'+song.id+'/vote',{vote:true}),b('PUT','/songs/'+song.id+'/vote',{vote:true})]);
  await b('PUT','/songs/'+song.id+'/vote',{vote:true});
  assert.equal((await a('GET','/state')).songs[0].votes,2);
  await a('PUT','/songs/__proto__/vote',{vote:true},400);
  await a('POST','/messages',{kind:'Augurio',text:'Buone feste!'},201);
  assert.equal((await b('GET','/state')).messages.length,0);
  const m=(await admin('GET','/admin/dashboard')).messages[0];
  await admin('PATCH','/admin/messages/'+m.id,{state:'published'});
  assert.equal((await b('GET','/state')).messages[0].text,'Buone feste!');
  await admin('PUT','/admin/awards',{mode:'open'});
  await a('PUT','/awards/0',{nominee:bp.id});
  await b('PUT','/awards/0',{nominee:bp.id});
  assert.deepEqual((await b('GET','/state')).awards,{});
  await admin('PUT','/admin/awards',{mode:'publish'});
  assert.equal((await a('GET','/state')).awards['Regalo più assurdo'][0].votes,2);
  const bytes=await sharp({create:{width:30,height:30,channels:3,background:'#dedddd'}}).png().toBuffer();
  const photo=await a('POST','/photos',bytes,201);
  const seen=await b('GET','/photos/'+photo.id);
  assert.equal((await sharp(seen).metadata()).format,'webp');
  await anonymous('GET','/photos/'+photo.id,undefined,401);
  await admin('DELETE','/admin/photos/'+photo.id);
  await b('GET','/photos/'+photo.id,undefined,404);
  const rejoin=session();
  await login(rejoin);
  await rejoin('POST','/restore',{code:alice.personalCode});
  assert.equal((await rejoin('GET','/state')).me.id,ap.id);
});
