import test from 'node:test';
import assert from 'node:assert/strict';
import { cropFor, poseFrom, smoothPose } from '../effects.mjs';

test('landscape and portrait camera streams use a centered 4:5 crop', () => {
  assert.deepEqual(cropFor(640,480), [128,0,384,480]);
  assert.deepEqual(cropFor(480,960), [0,180,480,600]);
});
test('anchors use image pixels for roll, and pin the nose to its landmark', () => {
  const pts = [[.3,.3],[.7,.4],[.5,.2],[.51,.45],[.5,.6],[.5,.8],[.23,.45],[.77,.45]];
  const pose = poseFrom(pts.map(([x,y])=>({x,y})), 800,1000);
  assert.equal(pose.noseX,408); assert.equal(pose.noseY,450);
  assert.equal(pose.jaw,200); assert.ok(Math.abs(pose.angle-Math.atan2(100,320))<1e-8);
});
test('short movements are damped; a new face or a stale frame is not dragged across the preview', () => {
  const a = {width:200,noseX:80,noseY:90,angle:.01}, b={...a,noseX:100,angle:.10};
  assert.ok(smoothPose(a,b,55).noseX>80 && smoothPose(a,b,55).noseX<100);
  assert.deepEqual(smoothPose(a,b,320),b);
  const far={...a,noseX:300}; assert.deepEqual(smoothPose(a,far,50),far);
});
