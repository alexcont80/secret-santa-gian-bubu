// The same catalogue drives the picker, asset requirements and gesture instructions.
export const wardrobe = [
  { id:'hat', name:'Cappello da renna', icon:'hat', slot:'head', art:['hat','antler'] },
  { id:'nose', name:'Naso di Rudolf', art:[] },
  { id:'beard', name:'Barba di Babbo', icon:'beard', art:['beard'] },
  { id:'frico', name:'Sua Maestà il Frico', icon:'crown', slot:'head', art:['crown'] },
  { id:'baubles', name:'Palle di Murano', icon:'bauble-red', art:['bauble-red','bauble-green'] },
  { id:'spritz', name:'Spritz da vista', icon:'glasses', art:['glasses'] },
  { id:'krampus', name:'Krampus in prova', icon:'horn', slot:'head', art:['horn'] },
  { id:'punch', name:'Gancio di marzapane', icon:'boxer', slot:'gag', art:['boxer','glove'],
    hint:'Apri la bocca per far partire il guantone.', punchline:'Ti spezzo i savoiardi.', tag:'PESI BISCOTTO', threshold:.32 },
  { id:'kiss', name:'Vischio a tradimento', icon:'mistletoe', slot:'gag', art:['mistletoe'],
    hint:'Manda un bacio verso la fotocamera.', punchline:'Il vischio è finto. Il bacio no.', tag:'BOTANICA APPLICATA', threshold:.48 },
  { id:'customs', name:'Dogana del Polo', icon:'customs', slot:'gag', art:['customs'],
    hint:'Sorridi a denti scoperti per il controllo pacchi.', punchline:'Ha qualcosa da scartare?', tag:'DOGANA DEL POLO', threshold:.52 },
  { id:'pop', name:'Tappo precoce', icon:'bottle', slot:'gag', art:['bottle'],
    hint:'Alza le sopracciglia per far saltare il tappo.', punchline:'Di solito duro fino a mezzanotte.', tag:'METODO IMPAZIENTE', threshold:.40 },
];

export const byItem = new Map(wardrobe.map(item => [item.id,item]));

export function toggleItem(selected, id) {
  if (selected.delete(id)) return;
  const item = byItem.get(id);
  if (!item) return;
  if (item.slot) {
    for (const other of selected) if (byItem.get(other)?.slot === item.slot) selected.delete(other);
  }
  selected.add(id);
}

export function chosenGag(selected) {
  for (const id of selected) if (byItem.get(id)?.slot === 'gag') return byItem.get(id);
  return null;
}

// A held expression fires once. Returning to neutral arms the next take.
export function makeGesture() {
  return { armed:true, onset:null, started:-Infinity };
}
export const gagDuration = 3300;
export function triggerGag(state, time) {
  state.started = time;
  state.armed = false;
  state.onset = null;
}
export function observeGesture(state, item, score, time) {
  if (!item) return;
  if (score < item.threshold * .58) {
    state.armed = true;
    state.onset = null;
  } else if (score >= item.threshold && state.armed && time - state.started >= gagDuration) {
    state.onset ??= time;
    if (time - state.onset >= 75) triggerGag(state,time);
  } else {
    state.onset = null;
  }
}
