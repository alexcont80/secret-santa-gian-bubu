import express from 'express';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeStore } from './store.mjs';
import { awards, categories, statuses, PartyError, requireThat, clean, normalize, nameOf, eligible, draw, classify } from './domain.mjs';

const cookieName = 'gian_bubu_party';
const jsonBody = express.json({ limit:'8kb' });
const eq = (a,b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
};
const publicPerson = p => ({id:p.id,first:p.first,last:p.last,status:p.status,owner:p.owner,bring:p.bring,food:p.food,version:p.version??0});
const targetId = /^[a-f\d-]{36}$/i;

export function settings(env = process.env) {
  const config = { mode:env.SANTA_DB ?? 'firestore', project:env.SANTA_FIRESTORE_PROJECT || env.GOOGLE_CLOUD_PROJECT,
    database:env.SANTA_FIRESTORE_DATABASE, bucket:env.SANTA_PHOTO_BUCKET, dbPath:resolve(env.SANTA_SQLITE_PATH ?? 'data/party.sqlite'),
    key:env.SANTA_SESSION_SECRET, admin:env.SANTA_ADMIN_NAME, adminPassword:env.SANTA_ADMIN_PASSWORD, guest:env.SANTA_GUEST_PASSWORD,
    gemini:env.SANTA_GEMINI_ENABLED === '1' ? env.GEMINI_API_KEY : null, model:env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite',
    spotifyId:env.SPOTIFY_CLIENT_ID, spotifySecret:env.SPOTIFY_CLIENT_SECRET, secure:env.SANTA_COOKIE_SECURE !== '0' };
  if (!['firestore','sqlite'].includes(config.mode) || (env.NODE_ENV === 'production' && (config.mode !== 'firestore' || !config.secure))) {
    throw Error('La pubblicazione richiede Firestore e cookie HTTPS.');
  }
  if (!config.guest || !config.admin || config.adminPassword?.length < 16 || !config.adminPassword ||
      !config.key || config.key.length < 32 || config.guest === config.adminPassword) throw Error('Configura i quattro segreti server di accesso.');
  return config;
}

export async function appFor(config, {dev=false}={}) {
  const store = await makeStore(config);
  const app = express();
  app.disable('x-powered-by');
  if (config.secure) app.set('trust proxy',1);
  app.use((req,res,next) => {
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(self), microphone=(), geolocation=()'});
    if (!dev) {
      res.set('X-Frame-Options','SAMEORIGIN');
      res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");
    }
    next();
  });
  const digest = (kind,value) => createHmac('sha256',config.key).update(kind + ':' + value).digest('base64url');
  const code = () => randomBytes(18).toString('base64url');
  const id = () => randomUUID();
  const canonical = p => normalize(nameOf(p));
  const now = () => new Date().toISOString();
  function authCookie(res,session) {
    const value = Buffer.from(JSON.stringify({...session, exp:Date.now()+21*86400000})).toString('base64url');
    res.cookie(cookieName,value+'.'+digest('session',value),{httpOnly:true,secure:config.secure,sameSite:'lax',maxAge:21*86400000,path:'/'});
  }
  function sessionOf(req) {
    const token = req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if (!token || token.length > 800) return null;
    const [value,signature] = token.split('.');
    if (!eq(signature,digest('session',value))) return null;
    try {
      const s=JSON.parse(Buffer.from(value,'base64url'));
      return s.exp > Date.now() ? s : null;
    } catch { return null; }
  }
  const attempts = new Map();
  function throttle(req,res,next) {
    const key=req.ip;
    const t=Date.now();
    if (attempts.size > 1500) for (const [ip,x] of attempts) if (x.end <= t) attempts.delete(ip);
    let entry=attempts.get(key);
    if (!entry || entry.end <= t) attempts.set(key,entry={end:t+5*60000,count:0});
    if (++entry.count > 24) return next(new PartyError(429,'Troppi tentativi. Aspetta qualche minuto.'));
    next();
  }
  function admin(req,res,next) { if (req.session.role !== 'admin') return next(new PartyError(403,'Accesso riservato agli amministratori.')); next(); }
  const person = (s,req) => {const p=s.people[req.session.sub]; requireThat(p?.status==='Ci sono',403,'Per partecipare conferma il tuo RSVP o recupera il tuo codice.'); return p;};
  const personByCode = (s,value) => Object.values(s.people).find(p => eq(p.codeHash,digest('person',value)));
  const publicMatch = (s,p) => s.matches?.[p.id] && s.people[s.matches[p.id]] ? {recipient:nameOf(s.people[s.matches[p.id]])} : null;
  function stats(s) {
    return {confirmed:eligible(s).length,absent:Object.values(s.people).filter(p=>p.status===statuses[1]).length,
      maybe:Object.values(s.people).filter(p=>p.status===statuses[2]).length,songs:Object.keys(s.songs).length,photos:Object.keys(s.photos).length};
  }
  function publicState(s,req) {
    const totals = {};
    if (s.awardsPublic || req.session.role === 'admin') for (const title of awards) {
      const counts = {};
      for (const ballot of Object.values(s.ballots)) if (ballot[title]) counts[ballot[title]]=(counts[ballot[title]]??0)+1;
      totals[title]=Object.entries(counts).filter(([id])=>s.people[id]).map(([id,votes])=>({name:nameOf(s.people[id]),votes})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name));
    }
    const p = s.people[req.session.sub];
    return { stats:stats(s), people:Object.values(s.people).map(publicPerson), drawn:!!s.matches, awardsOpen:s.awardsOpen,
      awardsPublic:s.awardsPublic, awards:totals,
      songs:Object.values(s.songs).map(({votes,owner,...song})=>({...song,votes:votes.length,voted:votes.includes(req.session.sub)})).sort((a,b)=>b.votes-a.votes||a.title.localeCompare(b.title)),
      photos:Object.values(s.photos).map(({id,at})=>({id,at})).reverse(),
      messages:Object.values(s.messages).filter(m=>m.state==='published').map(({id,text,kind,at})=>({id,text,kind,at})).reverse(),
      me:p ? {...publicPerson(p), mine:!p.owner, companion:Object.values(s.people).find(m=>m.owner===p.id) ? publicPerson(Object.values(s.people).find(m=>m.owner===p.id)) : null} : null,
      ballot:s.ballots[req.session.sub] ?? {}, admin:req.session.role==='admin'
    };
  }

  const api = express.Router();
  app.use('/api',(req,res,next)=> {
    res.set('Cache-Control','private, no-store');
    if (!['GET','HEAD'].includes(req.method) && req.get('x-party') !== '1') return next(new PartyError(403,'Richiesta non autorizzata.'));
    req.session=sessionOf(req);
    next();
  },api);
  api.get('/health', async (_req,res)=> {await store.read(); res.json({ok:true,db:config.mode});});
  api.get('/session',(req,res)=>res.json({role:req.session?.role ?? null,audio:existsSync(resolve(dev?'public/santa.mp3':'dist/santa.mp3'))}));
  api.post('/login',throttle,jsonBody,(req,res)=>{
    const auth = req.body ?? {};
    const role = auth.admin === true ? 'admin' : 'guest';
    const matches = eq(digest('auth',typeof auth.password==='string' ? auth.password : ''),digest('auth',role==='admin'?config.adminPassword:config.guest));
    requireThat(matches && (role==='guest'||eq(auth.name,config.admin)),401,'Accesso non riconosciuto.');
    authCookie(res,{role,sub:req.session?.role===role?req.session.sub:id()});
    res.json({role});
  });
  api.post('/logout',(req,res)=>{res.clearCookie(cookieName,{httpOnly:true,sameSite:'lax',secure:config.secure,path:'/'});res.json({ok:true});});
  api.use((req,res,next)=>req.session ? next() : next(new PartyError(401,'Entra nella festa.')));
  api.get('/state',async (req,res)=>res.json(publicState(await store.read(),req)));
  api.post('/restore',throttle,jsonBody,async (req,res)=>{
    const value=clean(req.body?.code,40,true);
    const p=personByCode(await store.read(),value);
    requireThat(p,404,'Codice personale non riconosciuto.');
    authCookie(res,{role:req.session.role, sub:p.id});
    res.json(publicPerson(p));
  });
  api.post('/rsvp',jsonBody,async (req,res)=>{
    const b = req.body ?? {};
    const {first,last,companion,bring,status}= {
      first:clean(b.first,50,true),last:clean(b.last,50,true),companion:clean(b.companion,100),bring:clean(b.bring,500),status:clean(b.status,25,true)
    };
    requireThat(statuses.includes(status),400,'Stato di partecipazione non valido.');
    const classified = await classify(bring,config.gemini,config.model);
    const personal=code(), partnerCode=code(), partnerId=id();
    const result=await store.mutate(s=>{
      const owner=req.session.sub, old=s.people[owner];
      const partner=Object.values(s.people).find(p=>p.owner===owner);
      requireThat(!old?.owner,403,'Il companion usa il codice personale. Il suo RSVP è gestito dall’invitato.');
      requireThat((b.version??0)===(old?.version??0),409,'La partecipazione è cambiata in un’altra sessione. Riapri la modifica.');
      const keepPartner = status==='Ci sono' && companion;
      if (s.matches) {
        requireThat(old && old.status===status && old.first===first && old.last===last &&
          (partner?.first ?? '')===(keepPartner || ''),409,'Estrazione definitiva. Puoi aggiornare solo cosa porti.');
      }
      const others=Object.values(s.people).filter(p=>p.id!==owner && p.owner!==owner);
      const primaryName=canonical({first,last});
      requireThat(!others.some(p=>canonical(p)===primaryName),409,'Questo nominativo è già registrato. Usa il codice personale.');
      requireThat(!keepPartner || (primaryName!==normalize(companion) && !others.some(p=>canonical(p)===normalize(companion))),409,'Il nominativo del companion è già registrato.');
      requireThat(others.length+1+(keepPartner?1:0)<=110,409,'Elenco invitati al completo.');
      const food = old?.bring===bring ? old.food : classified.items;
      s.people[owner]={id:owner,first,last,status,bring,food,foodSource:old?.bring===bring ? old.foodSource : classified.source,
        owner:null,version:(old?.version??0)+1,codeHash:old?.codeHash ?? digest('person',personal)};
      if (keepPartner) {
        const existing = partner && partner.first===companion;
        if (partner && !existing) delete s.people[partner.id];
        const pid=existing ? partner.id : partnerId;
        s.people[pid]={id:pid,first:companion,last:'',status,owner,bring:'',food:[],foodSource:'none',
          codeHash:existing?partner.codeHash:digest('person',partnerCode)};
        if (!existing) return {personalCode:old?null:personal,companionCode:partnerCode};
      } else if (partner) delete s.people[partner.id];
      return {personalCode:old?null:personal,companionCode:null};
    });
    res.json({...result,categorySource:classified.source});
  });
  api.post('/match',throttle,jsonBody,async (req,res)=>{
    const value=clean(req.body?.code,40,true);
    const s=await store.read();
    const p=personByCode(s,value);
    requireThat(p,404,'Codice personale non riconosciuto.');
    requireThat(s.matches,409,'L’estrazione deve ancora avvenire.');
    const result=publicMatch(s,p);
    requireThat(result,404,'Questo codice non è tra i partecipanti dell’estrazione.');
    res.json(result);
  });
  api.patch('/food/:id/:index',jsonBody,async (req,res)=>{
    const index=Number(req.params.index), cat=req.body?.category;
    requireThat(targetId.test(req.params.id)&&Number.isInteger(index)&&index>=0&&categories.includes(cat),400,'Categoria non valida.');
    await store.mutate(s=>{
      const p=s.people[req.params.id];
      requireThat(p?.food[index],404,'Pietanza non trovata.');
      requireThat(req.session.role==='admin'||p.id===req.session.sub,403,'Puoi correggere solo le tue pietanze.');
      requireThat(req.body?.item===p.food[index].item,409,'Il menu è cambiato. Aggiorna la pagina.');
      p.food[index].category=cat;
      p.version=(p.version??0)+1;
    });
    res.json({ok:true});
  });
  api.get('/spotify',async (req,res)=>{
    const query=clean(req.query.q,150,true);
    const url='https://open.spotify.com/search/'+encodeURIComponent(query);
    if (!config.spotifyId || !config.spotifySecret) return res.json({url,tracks:[]});
    try {
      const tokenResponse=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'authorization':'Basic '+Buffer.from(config.spotifyId+':'+config.spotifySecret).toString('base64'),'content-type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(5000)});
      if (!tokenResponse.ok) return res.json({url,tracks:[]});
      const token=await tokenResponse.json();
      const found=await fetch('https://api.spotify.com/v1/search?type=track&limit=5&q='+encodeURIComponent(query),{headers:{authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(5000)});
      if (!found.ok) return res.json({url,tracks:[]});
      const {tracks}=await found.json();
      res.json({url,tracks:(tracks?.items??[]).map(x=>({title:x.name,artist:x.artists.map(a=>a.name).join(', ')}))});
    } catch {res.json({url,tracks:[]});}
  });
  api.post('/songs',jsonBody,async (req,res)=>{
    const title=clean(req.body?.title,110,true), artist=clean(req.body?.artist,110,true);
    const songId=id();
    await store.mutate(s=>{
      const p=person(s,req);
      requireThat(Object.keys(s.songs).length<160,409,'Lista del DJ al completo.');
      requireThat(!Object.values(s.songs).some(x=>normalize(x.title+' '+x.artist)===normalize(title+' '+artist)),409,'Questo brano è già in lista. Puoi votarlo.');
      s.songs[songId]={id:songId,owner:p.id,title,artist,votes:[]};
    });
    res.status(201).json({id:songId});
  });
  api.put('/songs/:id/vote',jsonBody,async (req,res)=>{
    requireThat(targetId.test(req.params.id)&&typeof req.body?.vote==='boolean',400,'Voto non valido.');
    await store.mutate(s=>{
      const p=person(s,req), x=s.songs[req.params.id];
      requireThat(x,404,'Brano non trovato.');
      const votes=new Set(x.votes);
      if(req.body.vote) votes.add(p.id); else votes.delete(p.id);
      x.votes=[...votes];
    });
    res.json({ok:true});
  });
  api.post('/messages',jsonBody,async (req,res)=>{
    const text=clean(req.body?.text,320,true), kind=clean(req.body?.kind,24,true), messageId=id();
    requireThat(['Confessione','Dedica','Augurio'].includes(kind),400,'Tipo di messaggio non valido.');
    await store.mutate(s=>{
      requireThat(Object.keys(s.messages).length<220,409,'Confessionale al completo.');
      const recent=Object.values(s.messages).filter(m=>m.rateKey===digest('message',req.session.sub)&&Date.parse(m.at)>Date.now()-3600000);
      requireThat(recent.length<8,429,'Riprova tra un po’.');
      s.messages[messageId]={id:messageId,text,kind,at:now(),state:'pending',rateKey:digest('message',req.session.sub)};
    });
    res.status(201).json({state:'pending'});
  });
  api.post('/photos',express.raw({type:['image/jpeg','image/png','image/webp'],limit:'1mb'}),async (req,res)=>{
    requireThat(Buffer.isBuffer(req.body)&&req.body.length,400,'Fotografia mancante o formato non supportato.');
    const previous=await store.read();
    requireThat(Object.keys(previous.photos).length<160,409,'Galleria al completo.');
    let bytes;
    try {bytes=await sharp(req.body,{limitInputPixels:15_000_000}).rotate().resize(1000,1000,{fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer();}
    catch {throw new PartyError(400,'Non riesco a leggere la fotografia.');}
    requireThat(bytes.length <= 700_000,413,'Foto troppo grande. Prova con una versione più piccola.');
    const photoId=id();
    await store.putPhoto(photoId,bytes);
    try {
      await store.mutate(s=>{
        requireThat(Object.keys(s.photos).length<160,409,'Galleria al completo.');
        requireThat(Object.values(s.photos).filter(x=>x.owner===req.session.sub).length<22,409,'Limite di fotografie per sessione raggiunto.');
        s.photos[photoId]={id:photoId,at:now(),owner:req.session.sub};
      });
    } catch(err) {
      // A transport error can leave the transaction committed. Re-read before cleanup.
      const current=await store.read().catch(()=>null);
      if(current && !current.photos[photoId]) await store.deletePhoto(photoId).catch(()=>{});
      throw err;
    }
    res.status(201).json({id:photoId});
  });
  api.get('/photos/:id',async(req,res)=>{
    const photoId=req.params.id;
    requireThat(targetId.test(photoId)&&(await store.read()).photos[photoId],404,'Foto non trovata.');
    const bytes=await store.getPhoto(photoId);
    requireThat(bytes,404,'Foto non trovata.');
    res.type('image/webp').send(Buffer.from(bytes));
  });
  api.put('/awards/:category',jsonBody,async(req,res)=>{
    const title=awards[Number(req.params.category)];
    requireThat(title&&typeof req.body?.nominee==='string'&&targetId.test(req.body.nominee),400,'Premio o candidato non valido.');
    await store.mutate(s=>{
      const p=person(s,req), nominee=s.people[req.body?.nominee];
      requireThat(s.awardsOpen&&!s.awardsPublic,409,'Votazioni chiuse.');
      requireThat(nominee?.status==='Ci sono',400,'Candidato non disponibile.');
      s.ballots[p.id]??={};
      s.ballots[p.id][title]=nominee.id;
    });
    res.json({ok:true});
  });
  api.use('/admin',admin);
  api.get('/admin/dashboard', async (req,res)=>{
    const s=await store.read();
    res.json({...publicState(s,req),exclusions:s.exclusions,
      messages:Object.values(s.messages).map(({rateKey,...message})=>message).reverse()});
  });
  api.post('/admin/exclusions',jsonBody,async(req,res)=>{
    const pairs=req.body?.pairs;
    requireThat(Array.isArray(pairs)&&pairs.length>0&&pairs.length<=2&&pairs.every(x=>Array.isArray(x)&&x.length===2&&x.every(k=>typeof k==='string'&&targetId.test(k))&&x[0]!==x[1]),400,'Esclusioni non valide.');
    await store.mutate(s=>{
      requireThat(!s.matches,409,'Estrazione già definitiva.');
      requireThat(pairs.flat().every(k=>s.people[k]),400,'Partecipante non trovato.');
      const combined = new Map([...s.exclusions,...pairs].map(pair=>[pair.join(':'),pair]));
      requireThat(combined.size<=230,409,'Limite di esclusioni raggiunto.');
      s.exclusions=[...combined.values()];
    });
    res.json({ok:true});
  });
  api.delete('/admin/exclusions/:from/:to',async(req,res)=>{
    const {from,to}=req.params;
    requireThat(targetId.test(from)&&targetId.test(to),400,'Esclusione non valida.');
    await store.mutate(s=>{
      requireThat(!s.matches,409,'Estrazione già definitiva.');
      s.exclusions=s.exclusions.filter(([a,b])=>a!==from||b!==to);
    });
    res.json({ok:true});
  });
  api.post('/admin/draw',jsonBody,async(req,res)=>{
    requireThat(req.body?.confirm===true,400,'Conferma l’estrazione definitiva.');
    const count=await store.mutate(s=>{
      requireThat(!s.matches,409,'Estrazione già eseguita.');
      const ids=eligible(s).map(p=>p.id);
      s.matches=draw(ids,s.exclusions);
      return ids.length;
    });
    res.json({count});
  });
  api.patch('/admin/people/:id',jsonBody,async(req,res)=>{
    const status=req.body?.status;
    requireThat(targetId.test(req.params.id)&&statuses.includes(status),400,'Stato non valido.');
    await store.mutate(s=>{
      const p=s.people[req.params.id];
      requireThat(p&&!p.owner,404,'Partecipante non trovato.');
      requireThat(!s.matches,409,'Estrazione già definitiva.');
      p.status=status;
      p.version=(p.version??0)+1;
      const partner=Object.values(s.people).find(c=>c.owner===p.id);
      if (partner) partner.status=status;
    });
    res.json({ok:true});
  });
  api.patch('/admin/messages/:id',jsonBody,async(req,res)=>{
    const state=req.body?.state;
    requireThat(targetId.test(req.params.id)&&['published','hidden'].includes(state),400,'Stato non valido.');
    await store.mutate(s=>{const m=s.messages[req.params.id]; requireThat(m,404,'Messaggio non trovato.');m.state=state;});
    res.json({ok:true});
  });
  api.delete('/admin/:kind/:id',async(req,res)=>{
    const {kind,id}=req.params;
    requireThat(['photos','messages','songs'].includes(kind)&&targetId.test(id),400,'Elemento non valido.');
    if(kind==='photos') await store.deletePhoto(id);
    await store.mutate(s=>{delete s[kind][id];});
    res.json({ok:true});
  });
  api.put('/admin/awards',jsonBody,async(req,res)=>{
    const mode=req.body?.mode;
    requireThat(['open','closed','publish'].includes(mode),400,'Azione non valida.');
    await store.mutate(s=>{s.awardsOpen=mode==='open';s.awardsPublic=mode==='publish';});
    res.json({ok:true});
  });
  api.get('/admin/export',async(req,res)=>{
    const s=await store.read(), projected=publicState(s,req);
    res.attachment('secret-santa-gian-bubu.json').json({...projected,me:null,ballot:undefined,
      messages:Object.values(s.messages).map(({rateKey,...m})=>m)});
  });
  api.use((_req,_res,next)=>next(new PartyError(404,'Operazione non trovata.')));
  api.use((error,_req,res,_next)=>{
    const status=error instanceof PartyError?error.status:error.status===413?413:error.status===400?400:500;
    if(status===500)console.error('Errore API:',error.code??error.name);
    res.status(status).json({error:error instanceof PartyError?error.message:status===413?'File troppo grande.':status===400?'Richiesta non valida.':'Il servizio non risponde. Riprova tra poco.'});
  });

  if(dev){
    const { createServer } = await import('vite');
    const vite=await createServer({server:{middlewareMode:true},appType:'spa'});
    app.use(vite.middlewares);
  } else {
    const dist=resolve('dist');
    app.use(express.static(dist,{index:false,maxAge:'4h'}));
    app.get('/{*path}',(req,res)=>res.sendFile(resolve(dist,'index.html')));
  }
  return {app,store};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dev=process.argv.includes('--dev');
  const {app}=await appFor(settings(),{dev});
  app.listen(Number(process.env.PORT??8080),process.env.SANTA_BIND??'0.0.0.0',()=>console.log('Secret Santa pronto.'));
}
