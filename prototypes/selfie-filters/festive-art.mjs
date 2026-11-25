import { gagDuration } from './wardrobe.mjs';

const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));

function at(ctx, x, y, angle, draw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  draw();
  ctx.restore();
}

function sprite(ctx, image, x, y, width, alignY = .5) {
  const height = width * image.height / image.width;
  ctx.drawImage(image, x - width / 2, y - height * alignY, width, height);
}

function star(ctx, x, y, size, ink) {
  ctx.fillStyle = ink;
  ctx.beginPath();
  for (let i=0; i<8; i++) {
    const r = i%2 ? size*.24 : size, angle = i*Math.PI/4;
    const a = x+Math.cos(angle)*r, b = y+Math.sin(angle)*r;
    if (i) ctx.lineTo(a,b); else ctx.moveTo(a,b);
  }
  ctx.closePath(); ctx.fill();
}

function bubbles(ctx, width, time) {
  for (let i=0; i<8; i++) {
    const phase = (time/1550 + i*.173) % 1;
    const side = i%2 ? 1 : -1;
    const x = side * width * (.32 + .1*Math.sin(i*2+phase*4));
    ctx.globalAlpha = .8*Math.sin(phase*Math.PI);
    ctx.strokeStyle = i%3 ? '#ffe1a0' : '#fb963b';
    ctx.lineWidth = Math.max(1.2,width*.008);
    ctx.beginPath(); ctx.arc(x,-width*(.04+phase*.44),width*(.01+(i%3)*.004),0,TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function paintWardrobe(ctx, art, selected, p, time, wobble, still) {
  const w=p.width;
  if (selected.has('frico')) at(ctx,p.headX,p.headY,p.angle,() => {
    sprite(ctx,art.crown,0,.15*w,1.13*w,.91);
    const shine = still ? 1 : .7+.3*Math.sin(time/230);
    star(ctx,-.37*w,-.16*w,w*.046*shine,'#fff3bb');
    star(ctx,.35*w,-.34*w,w*.031*shine,'#fff9ca');
  });
  if (selected.has('krampus')) at(ctx,p.headX,p.headY,p.angle,() => {
    for (const side of [-1,1]) {
      ctx.save(); ctx.scale(side,1); ctx.translate(.34*w,.12*w);
      ctx.rotate(.14 + (still ? 0 : wobble*side*.3));
      ctx.drawImage(art.horn,-.085*w,-.64*w,.49*w,.69*w);
      ctx.restore();
    }
  });
  if (selected.has('baubles')) {
    const earrings = [[p.earLX,p.earLY,-1,art['bauble-green']], [p.earRX,p.earRY,1,art['bauble-red']]];
    for (const [x,y,side,image] of earrings) {
      const swing = still ? 0 : wobble*2.2 + Math.sin(time/510+side*.25)*.035;
      at(ctx,x+side*w*.038,y,p.angle*.40+swing,() => {
        ctx.strokeStyle='#e7b657'; ctx.lineWidth=Math.max(1.4,w*.009);
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,w*.10);ctx.stroke();
        sprite(ctx,image,0,w*.07,w*.217,0);
      });
    }
  }
  if (selected.has('spritz')) at(ctx,p.eyesX,p.eyesY,p.angle,() => {
    sprite(ctx,art.glasses,0,0,w*1.04);
    if (!still) bubbles(ctx,w,time);
  });
}

function heart(ctx,x,y,size,angle,color) {
  at(ctx,x,y,angle,() => {
    ctx.scale(size,size);ctx.fillStyle=color;ctx.beginPath();
    ctx.moveTo(0,.95);ctx.bezierCurveTo(-1.6,-.2,-.85,-1.1,0,-.46);
    ctx.bezierCurveTo(.85,-1.1,1.6,-.2,0,.95);ctx.fill();
  });
}

function lipstick(ctx, w) {
  ctx.scale(w,w);
  ctx.fillStyle='#bb274a';ctx.beginPath();ctx.moveTo(-.5,0);
  ctx.bezierCurveTo(-.20,-.37,-.06,-.23,0,-.14);ctx.bezierCurveTo(.18,-.35,.26,-.16,.5,0);
  ctx.bezierCurveTo(.24,.10,-.23,.08,-.5,0);ctx.fill();
  ctx.beginPath();ctx.moveTo(-.48,.04);ctx.bezierCurveTo(-.18,.38,.22,.39,.48,.04);
  ctx.bezierCurveTo(.19,.14,-.25,.14,-.48,.04);ctx.fill();
}

function biscuitGag(ctx,art,p,age,still) {
  const w=p.width;
  // Tap the cheek and retract, then leave icing stars and crumbs for the photo.
  const reach = still ? 0 : Math.min(clamp(age/290),clamp((870-age)/300));
  at(ctx,p.noseX,p.noseY,p.angle,() => {
    if (reach>0) sprite(ctx,art.glove,(-1.02+.69*reach)*w,.075*w,w*.50);
    if (age<260 && !still) return;
    for (let i=0;i<5;i++) {
      const a=i*1.20+(still ? 0 : .12*Math.sin(age/250));
      star(ctx,(-.31+Math.cos(a)*.12)*w,(.12+Math.sin(a)*.09)*w,w*(.025+i%2*.015),i%2?'#ffdc64':'#fff8df');
    }
    ctx.fillStyle='#a96635';
    for (let i=0;i<7;i++) {
      const drift=still ? 0 : clamp((age-260)/700);
      const x=(-.39+(i%3)*.048)*w, y=(.20+(i%4)*.023+drift*.05)*w;
      ctx.fillRect(x,y,w*.012,w*.012);
    }
  });
}

function mistletoeGag(ctx,art,p,age,still) {
  const w=p.width;
  at(ctx,p.headX,p.headY,p.angle*.65,() => {
    const sway=still?0:.08*Math.sin((age ?? 0)/430);
    at(ctx,.45*w,-.55*w,sway,()=>sprite(ctx,art.mistletoe,0,0,.43*w,0));
  });
  if (age === null) return;
  at(ctx,p.noseX,p.noseY,p.angle,() => {
    at(ctx,.31*w,.14*w,-.27,()=>lipstick(ctx,.25*w));
    for (let i=0;i<5;i++) {
      const phase=still ? (i+.5)/5 : (age/1300+i*.2)%1;
      ctx.globalAlpha=Math.sin(phase*Math.PI);
      heart(ctx,(.35+.10*Math.sin(i*3+phase*4))*w,(.03-phase*.65)*w,w*.042,-.2+i*.1,i%2?'#e94b66':'#ffc0bd');
    }
    ctx.globalAlpha=1;
  });
}

function champagne(ctx,p,age,still) {
  const w=p.width;
  const phase=still ? .68 : clamp(age/1000);
  at(ctx,p.headX,p.headY,0,() => {
    const x=(-.42+phase*.86)*w, y=(.12-Math.sin(phase*Math.PI)*.58)*w;
    if (still || age<1080) at(ctx,x,y,-.4+phase*4,() => {
      ctx.fillStyle='#87502e';ctx.fillRect(-.037*w,-.055*w,.074*w,.12*w);
      ctx.fillStyle='#e2b066';ctx.fillRect(-.05*w,-.08*w,.10*w,.058*w);
      ctx.strokeStyle='#ae733e';ctx.lineWidth=w*.008;
      ctx.strokeRect(-.05*w,-.08*w,.10*w,.058*w);
    });
    for (let i=0;i<22;i++) {
      const fall=still ? (i%7)/8 : ((age/2200+i*.118)%1);
      const drift=still ? 0 : Math.sin(i+fall*5)*.09;
      const xx=((i%11)/10*1.8-.90+drift)*w, yy=(-.57+fall*1.72)*w;
      ctx.globalAlpha=.8*Math.sin(Math.PI*fall);
      if (i%3===0) star(ctx,xx,yy,w*.029,'#fff2b8');
      else at(ctx,xx,yy,i+fall*2,()=>{ctx.fillStyle=i%2?'#f2b143':'#d84c65';ctx.fillRect(0,0,w*.017,w*.043);});
    }
    ctx.globalAlpha=1;
  });
}

export function drawGagOnFace(ctx,art,item,p,age,still) {
  if (item.id==='kiss') mistletoeGag(ctx,art,p,age,still);
  if (age===null) return;
  if (item.id==='punch') biscuitGag(ctx,art,p,age,still);
  if (item.id==='pop') champagne(ctx,p,age,still);
}

function stamp(ctx,cw,ch,age,still) {
  const bounce=still?1:1+Math.max(0,1-age/260)*.24;
  at(ctx,cw*.64,ch*.69,-.12,()=> {
    ctx.scale(bounce,bounce);
    const ww=cw*.51, hh=cw*.095;
    ctx.fillStyle='#fff3ce';ctx.fillRect(-ww/2,-hh/2,ww,hh);
    ctx.strokeStyle='#9b2a40';ctx.lineWidth=cw*.006;
    ctx.strokeRect(-ww/2+3,-hh/2+3,ww-6,hh-6);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#9b2a40';
    ctx.font='bold '+Math.round(cw*.047)+'px sans-serif';ctx.fillText('PACCO SOSPETTO',0,1,ww*.90);
  });
}

// Draw captions after undoing the camera mirror, including in the exported still.
export function drawGagCard(ctx,art,item,age,still) {
  const cw=ctx.canvas.width,ch=ctx.canvas.height;
  ctx.save();
  if (item.id==='customs' && age!==null) stamp(ctx,cw,ch,age,still);
  const hero = {punch:art.boxer,customs:art.customs,pop:art.bottle}[item.id];
  const active=age!==null;
  const heroWidth=cw*(active ? .24 : .18);
  if (active) {
    const top=ch*.855;
    ctx.fillStyle='#ffefca';ctx.fillRect(0,top,cw,ch-top);
    ctx.fillStyle='#983044';ctx.fillRect(0,top,cw,cw*.009);
    const tx=hero?cw*.265:cw*.055;
    ctx.textBaseline='middle';ctx.textAlign='left';
    ctx.fillStyle='#833248';ctx.font='bold '+Math.round(cw*.024)+'px sans-serif';
    ctx.fillText(item.tag,tx,top+ch*.045);
    ctx.fillStyle='#213931';ctx.font='bold italic '+Math.round(cw*.048)+'px Georgia, serif';
    ctx.fillText(item.punchline,tx,top+ch*.096,cw-tx-cw*.029);
  }
  if (hero) sprite(ctx,hero,heroWidth*.55,ch*.987,heroWidth,1);
  ctx.restore();
}

export function effectAge(start,time) {
  const age=time-start;
  return age>=0 && age<gagDuration ? age : null;
}
