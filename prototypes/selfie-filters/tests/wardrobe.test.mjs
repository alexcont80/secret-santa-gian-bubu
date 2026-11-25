import test from 'node:test';
import assert from 'node:assert/strict';
import { byItem, chosenGag, toggleItem, makeGesture, observeGesture, triggerGag, gagDuration } from '../wardrobe.mjs';
import { summarizeFace } from '../tracker.mjs';
import { effectAge } from '../festive-art.mjs';

test('headwear and gags have independent slots; glasses and earrings stay selected', () => {
  const selected = new Set(['hat','baubles','spritz','kiss']);
  toggleItem(selected,'frico');
  toggleItem(selected,'pop');
  assert.deepEqual([...selected],['baubles','spritz','frico','pop']);
  assert.equal(chosenGag(selected).id,'pop');
  toggleItem(selected,'pop'); assert.equal(chosenGag(selected),null);
});

test('all four gestures require a sustained expression and release before another take', () => {
  for (const name of ['punch','kiss','customs','pop']) {
    const item=byItem.get(name), state=makeGesture();
    observeGesture(state,item,.99,100); observeGesture(state,item,.1,130);
    assert.equal(state.started,-Infinity);
    observeGesture(state,item,.99,300); observeGesture(state,item,.99,410);
    assert.equal(state.started,410);
    observeGesture(state,item,.99,5500); assert.equal(state.started,410);
    observeGesture(state,item,.05,5600); observeGesture(state,item,.98,5700); observeGesture(state,item,.98,5790);
    assert.equal(state.started,5790);
  }
});

test('manual activation is immediate; effects expire before the next take', () => {
  const state=makeGesture();triggerGag(state,1200);
  assert.equal(effectAge(state.started,1200),0);
  assert.equal(effectAge(state.started,1200+gagDuration),null);
});

test('worker transfers ten anchors and named expression scores, tolerating missing scores', () => {
  const face=Array.from({length:478},(_,i)=>({x:i/478,y:.5,z:1}));
  face[14] = {...face[13],y:.6};
  assert.equal(summarizeFace({faceLandmarks:[]}),null);
  const {points,gestures}=summarizeFace({faceLandmarks:[face],faceBlendshapes:[{categories:[
    {categoryName:'mouthSmileRight',score:.7},{categoryName:'jawOpen',score:.82},{categoryName:'mouthSmileLeft',score:.9}
  ]}]});
  assert.equal(points.length,10); assert.deepEqual(points[8],{x:132/478,y:.5});
  assert.deepEqual(gestures,{punch:.82,kiss:0,customs:.8,pop:0});
});

test('a resting smile with closed lips does not stamp the photo', () => {
  const face=Array.from({length:478},()=>({x:.5,y:.5}));
  face[33]={x:.3,y:.4}; face[263]={x:.7,y:.4};
  const result=summarizeFace({faceLandmarks:[face],faceBlendshapes:[{categories:[
    {categoryName:'mouthSmileLeft',score:.90},{categoryName:'mouthSmileRight',score:.95}
  ]}]});
  assert.equal(result.gestures.customs,0);
});
