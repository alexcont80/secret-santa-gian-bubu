import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './reference.css';
import './style.css';

const event='Secret Santa da Gian & Bubu', house='/christmas-house.jpg', where='Via Maniago 15, Udine', start=Date.parse('2026-12-07T20:00:00+01:00');
const tabs=['🏠 Festa','🎁 Secret Santa','🍽️ Menu smart','🎧 DJ requests','📸 Selfie wall','💌 Confessionale','🏆 Christmas Awards','📺 Party Live'];
const courses=['Antipasti','Primi','Secondi','Contorni','Dolci','Bevande','Altro'];
const awards=['Regalo più assurdo','Peggior maglione natalizio','Miglior contributo gastronomico','Protagonista della serata'];
const statuses=['Ci sono','Forse','Non ci sono'];
const empty={people:[],songs:[],photos:[],messages:[],stats:{},ballot:{},awards:{},me:null};
const name=p=>[p?.first,p?.last].filter(Boolean).join(' ');
const form=e=>Object.fromEntries(new FormData(e.currentTarget));
const pauses=Array.from({length:45},(_,i)=>({left:(i*73%100)+'%',animationDuration:(8+i*17%16)+'s',animationDelay:'-'+i*.68+'s',opacity:.25+i%5*.13,fontSize:(8+i%9)+'px'}));

async function api(path, method='GET', data) {
  const raw=data instanceof Blob;
  const headers=method==='GET'?{}:{'X-Party':'1'};
  if(data!==undefined) headers['Content-Type']=raw?data.type:'application/json';
  const res=await fetch('/api'+path,{method,headers,body:data===undefined?undefined:raw?data:JSON.stringify(data)});
  const answer=await res.json().catch(()=>({}));
  if(!res.ok) throw Error(answer.error ?? 'Il servizio non risponde. Riprova.');
  return answer;
}
const Snow=()=> <div className="flakes" aria-hidden="true">{pauses.map((style,i)=><i key={i} className="snow" style={style}>{i%5===0?'✦':'•'}</i>)}</div>;
function Countdown({live=false}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);
  const r=Math.max(0,Math.floor((start-now)/1000));
  const tiles=[['Giorni',Math.floor(r/86400)],['Ore',Math.floor(r%86400/3600)],['Minuti',Math.floor(r%3600/60)],['Secondi',r%60]];
  return now>=start?<p className="countdown">{live?'Buona festa!':'La festa è cominciata.'}</p>:<div className={'count-tiles'+(live?' count-live':'')} aria-label="Conto alla rovescia">{tiles.map(([label,n])=><div key={label}><b>{String(n).padStart(2,'0')}</b><small>{label}</small></div>)}</div>;
}
function Section({title,children,eyebrow,...props}) {return <section {...props}>{eyebrow&&<span className="pill">{eyebrow}</span>}<h2>{title}</h2>{children}</section>}
function Button({alt=false,children,...props}){return <button type="button" className={alt?'alt':undefined} {...props}>{children}</button>}
function Quick({stats}) {return <div className="quick">{[['Confermati',stats.confirmed],['In estrazione',stats.confirmed],['Richieste DJ',stats.songs],['Selfie',stats.photos]].map(([label,n])=><div className="kpi" key={label}><b>{n??'–'}</b>{label}</div>)}</div>}
function Hero({stats}){
  return <header><div className="hero"><img src={house} alt="La casa addobbata a Natale e la slitta di Babbo Natale"/><div className="hero-content">
    <span className="badge">📍 Via Maniago 15 · Udine · Christmas Edition</span>
    <h1>Secret Santa<br/>da Gian &amp; Bubu</h1><p className="sub">Regali, un buffet e un pizzico di caos natalizio.</p>
    {stats&&<Quick stats={stats}/>}
  </div></div></header>;
}
function bell(ctx) {
  if (!ctx || ctx.state!=='running') return;
  [784,988,1318].forEach((f,i)=>{
    const at=ctx.currentTime+i*.15, osc=ctx.createOscillator(), volume=ctx.createGain();
    osc.type='sine';osc.frequency.value=f;
    volume.gain.setValueAtTime(.0001,at);volume.gain.exponentialRampToValueAtTime(.08,at+.02);volume.gain.exponentialRampToValueAtTime(.0001,at+.43);
    osc.connect(volume).connect(ctx.destination);osc.start(at);osc.stop(at+.45);
  });
}
function Login({logIn,muted,setMuted,hasVoice}){
  const [admin,setAdmin]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const audio=useRef(null),context=useRef(null);
  async function submit(e){
    e.preventDefault();const fields=form(e);setError('');setBusy(true);
    const sound=audio.current;
    if(!muted && window.AudioContext){context.current??=new AudioContext();context.current.resume().catch(()=>{});}
    try {
      await logIn({...fields,admin});
      if(!muted){bell(context.current);sound?.play().catch(()=>{});}
    }catch(err){setError(err.message);}
    finally{setBusy(false);}
  }
  return <main className="lock-main"><Hero/><div className="lock-box"><span className="pill">{admin?'Area amministrativa':'Accesso riservato'}</span>
    <h2>{admin?'Pannello di Gian & Bubu':'Entra nella festa'}</h2>
    <form onSubmit={submit}>
      {admin&&<label>Utente amministratore<input autoComplete="username" name="name" required/></label>}
      <label>Password<input autoComplete="current-password" name="password" type="password" required/></label>
      <div className="tools"><button disabled={busy}>{busy?'Accesso in corso…':'Entra'}</button>
        <Button alt onClick={()=>setMuted(!muted)}>{muted?'🔇 Audio spento':'🔔 Audio attivo'}</Button></div>
    </form>
    <p role="alert" className="error">{error}</p>
    <Button className="ghost" onClick={()=>{setAdmin(!admin);setError('');}}>{admin?'Torna agli invitati':'Area amministrativa'}</Button>
    {hasVoice&&<audio ref={audio} src="/santa.mp3" preload="none"/>}
  </div></main>;
}
function Restore({run}){
  return <form className="inline" onSubmit={e=>{e.preventDefault();run(()=>api('/restore','POST',form(e)),'Partecipazione recuperata.');}}>
    <label>Codice personale<input name="code" autoComplete="off" required/></label><button className="alt">Recupera RSVP</button>
  </form>;
}
function Rsvp({state,run}){
  const [codes,setCodes]=useState(null),[change,setChange]=useState(false);
  const editingVersion=useRef(0);
  const me=state.me, editable=(!me||me.mine);
  async function save(e){e.preventDefault();const d={...form(e),version:editingVersion.current};await run(()=>api('/rsvp','POST',d),r=>{
    setCodes(r.personalCode||r.companionCode?r:null);setChange(false);
    return 'Partecipazione salvata.'+(d.bring&&r.categorySource==='local'?' Menu da controllare.':'');
  });}
  const destination=encodeURIComponent(where), title=encodeURIComponent(event);
  return <>
    <Section title="Quando e dove" eyebrow="Christmas headquarters">
      <p className="when"><strong>Lunedì 7 dicembre 2026 · ore 20:00</strong><br/>{where}</p><Countdown/>
      <div className="tools links">
        <a href={'https://www.google.com/maps/search/?api=1&query='+destination} target="_blank" rel="noreferrer">Google Maps ↗</a>
        <a href={'https://waze.com/ul?q='+destination+'&navigate=yes'} target="_blank" rel="noreferrer">Waze ↗</a>
        <a href={'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+title+'&dates=20261207T190000Z/20261207T225900Z&location='+destination} target="_blank" rel="noreferrer">Google Calendar ↗</a>
        <a href="/evento.ics" download>Outlook / ICS ↓</a>
      </div>
    </Section>
    <Section title="Partecipa alla festa">
      {editable&&(!me||change)?<form key={me?.id??'new'} onSubmit={save}>
        <div className="row"><label>Nome<input name="first" defaultValue={me?.first} maxLength={50} required/></label><label>Cognome<input name="last" defaultValue={me?.last} maxLength={50} required/></label></div>
        <div className="row"><label>Presenza<select name="status" defaultValue={me?.status??statuses[0]}>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Nome e cognome del companion<input name="companion" defaultValue={name(me?.companion)} maxLength={100}/></label></div>
        <label>Cosa porti?<textarea name="bring" defaultValue={me?.bring} maxLength={500} placeholder="Es. lasagne, prosecco e tiramisù"/></label>
        <button>Salva partecipazione</button>
      </form>:<div className="line"><div><strong>{name(me)}</strong><br/>{me?.status}{me?.companion&&<> · con {name(me.companion)}</>}</div>{editable&&<Button alt onClick={()=>{editingVersion.current=me.version;setChange(true);}}>Modifica partecipazione</Button>}</div>}
      {change&&<Button alt onClick={()=>setChange(false)}>Annulla modifica</Button>}
      {state.drawn&&<p className="notice">L’estrazione è definitiva. Puoi ancora aggiornare cosa porti.</p>}
      {codes&&<div className="reveal-box" role="status"><b>Conserva i codici. Sono mostrati qui una sola volta.</b>
        {codes.personalCode&&<p>Il tuo codice: <code>{codes.personalCode}</code></p>}
        {codes.companionCode&&<p>Codice companion: <code>{codes.companionCode}</code></p>}
        <Button alt onClick={()=>setCodes(null)}>Ho salvato i codici</Button></div>}
      <details><summary>Ho già un codice personale</summary><Restore run={run}/></details>
    </Section>
    <Section title="Chi ci sarà">
      {state.people.length?state.people.map(p=><div className="line" key={p.id}><div><b>{name(p)}</b> {p.owner&&<span className="tag">Companion</span>}</div><span>{p.status}</span></div>):<p className="muted">Nessuna partecipazione registrata.</p>}
    </Section>
  </>;
}
function Secret({state,run}){
  const [recipient,setRecipient]=useState('');
  return <Section title="La grande estrazione" eyebrow="Scambio di regali">
    <div className="gift" aria-hidden="true">🎁</div>
    <p>{state.stats.confirmed??0} partecipanti · {state.drawn?'Estrazione definitiva':'Estrazione in attesa'}</p>
    <form onSubmit={e=>{e.preventDefault();setRecipient('');run(()=>api('/match','POST',form(e)),r=>{setRecipient(r.recipient);return '';});}}>
      <label>Il tuo codice personale<input name="code" type="password" autoComplete="off" required/></label><button>Apri il regalo in privato</button>
    </form>
    {recipient&&<div className="reveal-box"><small>Il tuo regalo è per</small><h3>{recipient}</h3><Button alt onClick={()=>setRecipient('')}>Nascondi</Button></div>}
  </Section>;
}
function Menu({state,run}){
  const entries=state.people.filter(p=>p.status==='Ci sono').flatMap(p=>(p.food??[]).map((f,i)=>({p,f,i})));
  return <Section title="Menu della serata" eyebrow="Food & Drinks">
    <p>Per aggiungere pietanze, compila «Cosa porti?» nel tuo RSVP. Puoi correggere le categorie dei tuoi contributi qui.</p>
    <div className="menu-grid">{courses.map(category=><div className="menu-group" key={category}><h3>{category}</h3>
      {entries.filter(x=>x.f.category===category).map(({p,f,i})=><div className="line" key={p.id+'-'+i}><div><b>{f.item}</b><br/><small>{name(p)}</small></div>
        {(p.id===state.me?.id||state.admin)&&<select aria-label={'Categoria '+f.item} value={category} onChange={e=>run(()=>api('/food/'+p.id+'/'+i,'PATCH',{category:e.target.value,item:f.item}),'Categoria aggiornata.')}>{courses.map(x=><option key={x}>{x}</option>)}</select>}</div>)}
      {!entries.some(x=>x.f.category===category)&&<p className="muted">Ancora niente.</p>}</div>)}</div>
  </Section>;
}
function DJ({state,run}){
  const [title,setTitle]=useState(''),[artist,setArtist]=useState(''),[found,setFound]=useState(null);
  return <>
    <Section title="DJ, metti questa!">
      <form onSubmit={e=>{e.preventDefault();run(()=>api('/songs','POST',{title,artist}),()=>{setTitle('');setArtist('');setFound(null);return 'Richiesta aggiunta.';});}}>
        <div className="row"><label>Brano<input name="title" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={110}/></label>
          <label>Artista<input name="artist" value={artist} onChange={e=>setArtist(e.target.value)} required maxLength={110}/></label></div>
        <div className="tools"><button>Aggiungi brano</button><Button alt disabled={!title.trim()} onClick={()=>run(()=>api('/spotify?q='+encodeURIComponent(title+' '+artist)),r=>{setFound(r);return '';})}>Cerca su Spotify</Button></div>
      </form>
      {found&&<div>{found.tracks.map((x,i)=><div className="line" key={i}><div>{x.title} · {x.artist}</div><Button alt onClick={()=>{setTitle(x.title);setArtist(x.artist);}}>Usa brano</Button></div>)}<p><a href={found.url} target="_blank" rel="noreferrer">Apri la ricerca su Spotify ↗</a></p></div>}
    </Section>
    <Section title="Classifica delle richieste">
      {state.songs.length?state.songs.map((song,i)=><div className="line" key={song.id}><div><b>{i+1}. {song.title}</b><br/><small>{song.artist}</small></div>
        <Button alt={song.voted} aria-pressed={song.voted} aria-label={'Vota '+song.title} onClick={()=>run(()=>api('/songs/'+song.id+'/vote','PUT',{vote:!song.voted}),'Voto aggiornato.')}>♥ {song.votes}</Button></div>):<p className="muted">Il DJ aspetta istruzioni.</p>}
    </Section>
  </>;
}
function frameBlob(source,w,h){
  const canvas=document.createElement('canvas'), scale=Math.min(1,1000/Math.max(w,h));
  canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
  canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Non riesco a preparare la foto.')),'image/webp',.78));
}
function Selfies({state,run}){
  const video=useRef(null),stream=useRef(null),requestId=useRef(0);
  const [facing,setFacing]=useState('user'),[camera,setCamera]=useState(false),[preview,setPreview]=useState(null),[cameraError,setCameraError]=useState('');
  const stop=()=>{requestId.current++;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;};
  useEffect(()=>()=>stop(),[]);
  useEffect(()=>{if(camera&&video.current)video.current.srcObject=stream.current;},[camera,facing]);
  useEffect(()=>{if(preview)return()=>URL.revokeObjectURL(preview.url);},[preview]);
  async function open(mode){
    stop();setCamera(false);setCameraError('');const current=requestId.current;
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Serve una connessione HTTPS per usare la fotocamera.');
      const result=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:mode}},audio:false});
      if(current!==requestId.current){result.getTracks().forEach(t=>t.stop());return;}
      stream.current=result;setFacing(mode);setCamera(true);
    }catch(e){if(current===requestId.current)setCameraError(e.name==='NotAllowedError'?'Consenti l’accesso alla fotocamera nelle impostazioni del browser.':'Fotocamera non disponibile. Puoi caricare una foto.');}
  }
  async function previewOf(file){setPreview({file,url:URL.createObjectURL(file)});}
  return <>
    <Section title="Christmas Selfie Wall">
      <div className="tools"><Button onClick={()=>open(facing)}>Apri fotocamera</Button>{camera&&<><Button alt onClick={()=>open(facing==='user'?'environment':'user')}>Cambia fotocamera</Button><Button alt onClick={()=>{stop();setCamera(false);}}>Chiudi fotocamera</Button></>}
        <label className="upload">Carica dal telefono<input type="file" accept="image/*" onChange={async e=>{const file=e.target.files[0];if(!file)return;try{const img=await createImageBitmap(file);await previewOf(await frameBlob(img,img.width,img.height));img.close();}catch{setCameraError('Il file scelto non è una foto utilizzabile.');}finally{e.target.value='';}}}/></label>
      </div>
      <p role="status" className="error">{cameraError}</p>
      {camera&&<><div className="video-wrap"><video id="cameraView" ref={video} autoPlay playsInline muted/></div><Button onClick={async()=>{try{const v=video.current;if(!v.videoWidth)throw Error();await previewOf(await frameBlob(v,v.videoWidth,v.videoHeight));stop();setCamera(false);}catch{setCameraError('Aspetta che l’anteprima della fotocamera sia pronta.');}}}>Scatta</Button></>}
      {preview&&<div className="preview-frame"><img src={preview.url} alt="Anteprima del selfie"/><div><p>La foto sarà visibile agli invitati. Caricala solo se chi compare è d’accordo.</p>
        <div className="tools"><Button onClick={()=>run(()=>api('/photos','POST',preview.file),()=>{setPreview(null);return 'Selfie pubblicato.';})}>Conferma foto</Button><Button alt onClick={()=>setPreview(null)}>Scarta</Button></div></div></div>}
    </Section>
    <Section title="Selfie degli invitati">{state.photos.length?<div className="wall-grid">{state.photos.map(p=><div className="photo-card" key={p.id}><img loading="lazy" src={'/api/photos/'+p.id} alt="Selfie dalla festa"/></div>)}</div>:<p className="muted">Ancora nessun selfie.</p>}</Section>
  </>;
}
function Confession({state,run}){
  return <><Section title="Confessionale natalizio">
    <form onSubmit={e=>{e.preventDefault();const handle=e.currentTarget,d=form(e);run(()=>api('/messages','POST',d),()=>{handle.reset();return 'Messaggio in attesa di moderazione.';});}}>
      <label>Tipo<select name="kind">{['Confessione','Dedica','Augurio'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Messaggio anonimo<textarea name="text" maxLength={320} required/></label><button>Invia alla moderazione</button>
    </form></Section>
    <Section title="Bacheca anonima">{state.messages.length?state.messages.map(m=><div className="line" key={m.id}><div><span className="tag">{m.kind}</span><p>{m.text}</p></div></div>):<p className="muted">Nessun messaggio pubblicato.</p>}</Section></>;
}
function Results({state}){
  return <div className="award-grid">{awards.map(a=><div key={a} className="stat"><h3>{a}</h3>
    {(state.awards[a]??[]).slice(0,5).map(x=><div className="line" key={x.name}><div>{x.name}</div><span>{x.votes}</span></div>)}
    {!state.awards[a]?.length&&<small>Nessun voto</small>}</div>)}</div>;
}
function Awards({state,run}){
  const nominated=state.people.filter(p=>p.status==='Ci sono');
  return <Section title="Christmas Awards">{state.awardsPublic?<Results state={state}/>:state.awardsOpen?<div className="award-grid">{awards.map((a,i)=><form key={a} className="stat" onSubmit={e=>{e.preventDefault();run(()=>api('/awards/'+i,'PUT',form(e)),'Voto registrato.');}}>
    <h3>{a}</h3><label>Candidato<select key={state.ballot[a]??''} name="nominee" required defaultValue={state.ballot[a]??''}><option value="">Scegli</option>{nominated.map(p=><option key={p.id} value={p.id}>{name(p)}</option>)}</select></label><button>{state.ballot[a]?'Aggiorna voto':'Vota'}</button>
  </form>)}</div>:<p>I risultati saranno disponibili qui dopo la pubblicazione.</p>}</Section>;
}
function Live({state}){
  const ref=useRef(null);
  const [index,setIndex]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setIndex(x=>x+1),5800);return()=>clearInterval(t)},[]);
  const photo=state.photos[index%state.photos.length];
  return <Section title="Party Live" className="live">
    <div ref={ref} className="tv"><div className="tv-heading"><h2>{event}</h2><Button alt onClick={()=>document.fullscreenElement?document.exitFullscreen():ref.current?.requestFullscreen()}>Schermo intero</Button></div>
      <Countdown live/><div className="tv-body"><img className="tv-photo" src={photo?'/api/photos/'+photo.id:house} alt={photo?'Selfie dalla festa':'Casa addobbata'}/>
        <div><h3>Classifica DJ</h3>{state.songs.slice(0,5).map(s=><div key={s.id} className="line"><div>{s.title} · {s.artist}</div><span>♥ {s.votes}</span></div>)}
          {state.awardsPublic&&<Results state={state}/>}</div></div>
    </div></Section>;
}
function Admin({state,run}){
  const [adminData,setData]=useState(null),[mode,setMode]=useState(''),[reveal,setReveal]=useState(false);
  async function load(){await run(()=>api('/admin/dashboard'),r=>{setData(r);return '';});}
  useEffect(()=>{load();const id=setInterval(load,18000);return()=>clearInterval(id)},[]);
  const a=adminData??{...state,exclusions:[]};
  const people=a.people;
  const update=(op,note)=>run(op,()=>{load();return note;});
  function draw(){if(!window.confirm('Estrarre definitivamente i destinatari?'))return;setMode('draw-shake');run(()=>api('/admin/draw','POST',{confirm:true}),r=>{
    setMode('draw-party');setReveal(true);setTimeout(()=>setMode(''),2700);load();
    return 'Estrazione definitiva effettuata per '+r.count+' partecipanti.';
  },()=>setMode(''));}
  return <>
    <Section title="Regia della festa">
      <div className="tools links"><a href="/api/admin/export" download>Esporta dati JSON ↓</a><Button alt onClick={load}>Aggiorna dashboard</Button></div>
    </Section>
    <Section title="Estrazione definitiva">
      <div className={'gift stage '+mode} aria-hidden="true"><span>🎁</span><span>🎁</span><span>🎁</span>{mode==='draw-party'&&pauses.slice(0,28).map((p,i)=><i key={i} style={{left:p.left,animationDelay:i*.04+'s'}}>✦</i>)}</div>
      {!a.drawn&&!state.drawn?<>
        <form className="row" onSubmit={e=>{e.preventDefault();const d=form(e);update(()=>api('/admin/exclusions','POST',{pairs:[[d.from,d.to],...(d.both?[[d.to,d.from]]:[])]}),'Esclusione salvata.');}}>
          <label>Chi estrae<select name="from" required><option value="">Scegli</option>{people.map(p=><option key={p.id} value={p.id}>{name(p)}</option>)}</select></label>
          <label>Non può estrarre<select name="to" required><option value="">Scegli</option>{people.map(p=><option key={p.id} value={p.id}>{name(p)}</option>)}</select></label>
          <label className="checkbox"><input type="checkbox" name="both"/> Anche al contrario</label><Button type="submit" alt>Aggiungi esclusione</Button>
        </form>
        {a.exclusions.map(([x,y],i)=><div className="line" key={i}><div>{name(people.find(p=>p.id===x))} → {name(people.find(p=>p.id===y))}</div>
          <Button alt onClick={()=>update(()=>api('/admin/exclusions/'+x+'/'+y,'DELETE'),'Esclusione rimossa.')}>Rimuovi</Button></div>)}
        <Button onClick={draw} disabled={state.stats.confirmed<2||!!mode}>Estrai i nomi</Button>
      </>:<p className={reveal?'reveal-box':''}>Estrazione completata. Ogni invitato apre il proprio abbinamento con il codice personale.</p>}
    </Section>
    <Section title="Presenze e partecipanti">{people.map(p=><div className="line" key={p.id}><div>{name(p)}{p.owner&&<small> · companion</small>}</div>
      {p.owner||state.drawn?<span>{p.status}</span>:<select aria-label={'Presenza '+name(p)} value={p.status} onChange={e=>update(()=>api('/admin/people/'+p.id,'PATCH',{status:e.target.value}),'Presenza aggiornata.')}>{statuses.map(x=><option key={x}>{x}</option>)}</select>}</div>)}</Section>
    <Menu state={state} run={run}/>
    <Section title="Moderazione del confessionale">{a.messages.map(m=><div className="line" key={m.id}><div><span className="tag">{m.kind} · {({pending:'In attesa',published:'Pubblicato',hidden:'Nascosto'})[m.state]}</span><p>{m.text}</p></div>
      <div className="tools"><Button alt onClick={()=>update(()=>api('/admin/messages/'+m.id,'PATCH',{state:'published'}),'Messaggio pubblicato.')}>Pubblica</Button><Button alt onClick={()=>update(()=>api('/admin/messages/'+m.id,'PATCH',{state:'hidden'}),'Messaggio nascosto.')}>Nascondi</Button></div></div>)}</Section>
    <Section title="Gestione fotografie"><div className="wall-grid">{state.photos.map(p=><div className="photo-card" key={p.id}><img loading="lazy" src={'/api/photos/'+p.id} alt="Selfie da moderare"/>
      <Button alt onClick={()=>{if(window.confirm('Eliminare la foto?'))update(()=>api('/admin/photos/'+p.id,'DELETE'),'Foto eliminata.');}}>Elimina</Button></div>)}</div></Section>
    <Section title="Gestione votazioni"><div className="tools"><Button alt onClick={()=>update(()=>api('/admin/awards','PUT',{mode:'open'}),'Votazioni aperte.')}>Apri votazioni</Button>
      <Button alt onClick={()=>update(()=>api('/admin/awards','PUT',{mode:'closed'}),'Votazioni chiuse.')}>Chiudi</Button>
      <Button onClick={()=>update(()=>api('/admin/awards','PUT',{mode:'publish'}),'Risultati pubblicati.')}>Pubblica risultati</Button></div><Results state={a}/></Section>
  </>;
}
function App(){
  const [role,setRole]=useState(undefined),[tab,setTab]=useState(0),[state,setState]=useState(empty),[flash,setFlash]=useState(''),[error,setError]=useState('');
  const [hasVoice,setHasVoice]=useState(false);
  const [muted,setMuted]=useState(()=>sessionStorage.getItem('party-muted')==='1');
  const last=useRef(0);
  useEffect(()=>{sessionStorage.setItem('party-muted',muted?'1':'0');},[muted]);
  useEffect(()=>{api('/session').then(r=>{setRole(r.role);setHasVoice(r.audio);}).catch(()=>setRole(null));},[]);
  async function refresh(){
    const k=++last.current;
    try{const loaded=await api('/state');if(k===last.current)setState(loaded);}catch(e){if(k===last.current)setError(e.message);}
  }
  useEffect(()=>{if(!role)return;refresh();const id=setInterval(refresh,10000);return()=>{clearInterval(id);last.current++;};},[role]);
  async function run(operation,onSuccess,onError){
    setError('');setFlash('');
    try {const answer=await operation();const message=typeof onSuccess==='function'?onSuccess(answer):onSuccess;if(message)setFlash(message);await refresh();}
    catch(e){setError(e.message);onError?.();}
  }
  useEffect(()=>{if(flash){const x=setTimeout(()=>setFlash(''),4000);return()=>clearTimeout(x);}},[flash]);
  const content=[Rsvp,Secret,Menu,DJ,Selfies,Confession,Awards,Live,Admin];
  const Page=content[tab]??Rsvp;
  return <><div className="house-backdrop" aria-hidden="true"/><Snow/>{role===undefined?<main><p>Caricamento…</p></main>:!role?<Login hasVoice={hasVoice} muted={muted} setMuted={setMuted} logIn={async d=>{const r=await api('/login','POST',d);setRole(r.role);setTab(r.role==='admin'?8:0);}}/>:
    <main><Hero stats={state.stats}/><nav aria-label="Sezioni della festa">{[...tabs,...(role==='admin'?['⚙️ Regia']:[])].map((t,i)=><button className={i===tab?'active':''} key={t} aria-current={i===tab?'page':undefined} onClick={()=>{setTab(i);setError('');setFlash('');}}>{t}</button>)}</nav>
      {(error||flash)&&<div className={'toast '+(error?'error':'')} role={error?'alert':'status'}>{error||flash}<button className="ghost" aria-label="Chiudi avviso" onClick={()=>{setError('');setFlash('');}}>×</button></div>}
      <Page state={state} run={run}/><footer className="footer-note"><p>Made for Christmas chaos · Gian &amp; Bubu</p><div className="tools">
        <Button alt onClick={()=>setMuted(!muted)}>{muted?'🔇 Audio spento':'🔔 Audio attivo'}</Button>
        <Button className="ghost" onClick={async()=>{await api('/logout','POST');setState(empty);setRole(null);setTab(0);setError('');setFlash('');}}>Esci</Button>
      </div></footer></main>}</>;
}
createRoot(document.getElementById('root')).render(<App/>);
