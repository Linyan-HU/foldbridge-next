import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../public/entry-cases/__entry_v3_site__/workbench-pure.mjs';

const profiles = ['A','B','C','D','E'].map(profile_id => ({profile_id, render_strand_id:'strand_P', length:4, row_index:0, shard_id:'0'}));
const context = (primary = profiles[0]) => ({key:'case/P', profiles, primary, strandId:'strand_P', length:4, values:[0,-1,NaN,2]});
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject}; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('comparison coverage counts finite zero and negative values per primary pair', () => {
  assert.equal(typeof api.comparisonCoverage, 'function');
  assert.deepEqual(api.comparisonCoverage([0,-1,NaN,2], [NaN,0,3,4]), {length:4,primaryFinite:3,comparisonFinite:3,sharedFinite:2});
  assert.equal(api.comparisonCoverage([NaN,Infinity], [0,-1]).sharedFinite,0);
  assert.throws(() => api.comparisonCoverage([1], []));
  assert.throws(() => api.comparisonCoverage('1', [1]));
  const a = new Float32Array([1,2,3,4]); const b = new Float32Array([10,20,30,40]);
  assert.equal(api.normalizeReactivityProfile(b).cap, api.normalizeReactivityProfile(a).cap * 10);
  assert.deepEqual([...a],[1,2,3,4]);
});

test('comparison eligibility uses exact index membership and strand identity', () => {
  assert.equal(typeof api.eligibleComparisonProfiles, 'function');
  const all = [...profiles, {...profiles[1],profile_id:'other',render_strand_id:'strand_p'}];
  assert.deepEqual(api.eligibleComparisonProfiles({...context(),profiles:all,selectedIds:['B']}).map(p=>p.profile_id), ['C','D','E']);
  assert.throws(()=>api.eligibleComparisonProfiles({...context({...profiles[0]}),selectedIds:[]}));
});

test('index lengths must agree with the current materialized strand',()=>{
  const bad={...profiles[1],length:3};
  assert.deepEqual(api.eligibleComparisonProfiles({...context(),profiles:[profiles[0],bad]}),[]);
  const shard={meta:{case_id:'case',shard_id:'0',format:'float32_le_row_major',strand_length:4,profile_count:1},values:new Float32Array(4)};
  assert.throws(()=>api.readProfileShardRow(bad,shard,{caseId:'case',length:4}));
});

test('comparison controller enforces order, cap, removal and isolated failure', async () => {
  assert.equal(typeof api.createProfileComparisonController,'function');
  const requests=[];
  const c=api.createProfileComparisonController({load:()=>{const d=deferred();requests.push(d);return d.promise;},onChange:()=>{}});
  c.setContext(context()); assert.deepEqual(c.snapshot(),[]); assert.equal(requests.length,0);
  c.add(profiles[1]); c.add(profiles[2]); c.add(profiles[3]);
  assert.throws(()=>c.add(profiles[1])); assert.throws(()=>c.add(profiles[4]));
  requests[2].resolve([1,2,3,4]); requests[0].resolve([NaN,0,3,4]); requests[1].reject(new Error('unavailable')); await tick();
  assert.deepEqual(c.snapshot().map(x=>[x.profile.profile_id,x.status]), [['B','ready'],['C','error'],['D','ready']]);
  assert.equal(c.snapshot()[0].coverage.sharedFinite,2);
  c.remove('C'); c.add(profiles[4]); assert.deepEqual(c.snapshot().map(x=>x.profile.profile_id),['B','D','E']);
});

test('removed, replaced, context-switched and disposed requests cannot revive rows', async () => {
  assert.equal(typeof api.createProfileComparisonController,'function');
  const requests=[]; let notifications=0;
  const c=api.createProfileComparisonController({load:()=>{const d=deferred();requests.push(d);return d.promise;},onChange:()=>notifications++});
  c.setContext(context()); c.add(profiles[1]); c.remove('B'); c.add(profiles[1]);
  requests[0].resolve([1,1,1,1]); await tick(); assert.equal(c.snapshot()[0].status,'loading');
  requests[1].resolve([2,2,2,2]); await tick(); assert.equal(c.snapshot()[0].values[0],2);
  c.setContext(context(profiles[1])); assert.equal(c.snapshot().length,0);
  c.add(profiles[2]); c.setContext({...context(),key:'case/p'}); requests[2].resolve([3,3,3,3]); await tick(); assert.equal(c.snapshot().length,0);
  c.add(profiles[3]); c.dispose(); const count=notifications; requests[3].reject(new Error('late')); await tick(); assert.equal(notifications,count);
});

test('shard loader deduplicates in-flight work without automatic retry', async () => {
  assert.equal(typeof api.createCachedLoader,'function');
  let calls=0; const d=deferred(); const load=api.createCachedLoader(()=>{calls++;return d.promise;});
  const a=load('x'),b=load('x'); assert.equal(a,b); assert.equal(calls,1);
  d.resolve(42); assert.equal(await a,42); assert.equal(await load('x'),42); assert.equal(calls,1);
  let errors=0; const fail=api.createCachedLoader(async()=>{errors++;throw Error('bad');});
  await assert.rejects(fail('x')); assert.equal(errors,1); await assert.rejects(fail('x')); assert.equal(errors,2);
});

test('profile rows reject malformed metadata instead of returning truncated data', () => {
  assert.equal(typeof api.readProfileShardRow,'function');
  const shard={meta:{case_id:'case',shard_id:'0',format:'float32_le_row_major',strand_length:4,profile_count:1},values:new Float32Array([0,1,2,3])};
  assert.deepEqual([...api.readProfileShardRow(profiles[0],shard,{caseId:'case',length:4})],[0,1,2,3]);
  for(const row_index of [-1,1,0.5]) assert.throws(()=>api.readProfileShardRow({...profiles[0],row_index},shard,{caseId:'case',length:4}));
  assert.throws(()=>api.readProfileShardRow(profiles[0],{...shard,values:new Float32Array(3)},{caseId:'case',length:4}));
  assert.throws(()=>api.readProfileShardRow(profiles[0],shard,{caseId:'wrong',length:4}));
});
