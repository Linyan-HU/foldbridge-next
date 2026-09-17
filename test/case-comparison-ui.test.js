import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/entry-cases/__entry_v3_site__/workbench.js',import.meta.url),'utf8');
test('comparison controls use a closed native disclosure without clearing selected tracks',()=>{
  const body=source.slice(source.indexOf('function mountProfileComparisons()'),source.indexOf('\nfunction showPrimaryError'));
  assert.ok(body.includes('document.createElement("details")'));
  assert.ok(body.includes('document.createElement("summary")'));
  assert.ok(!body.includes('.open = true'));
  assert.ok(body.includes('root.append(disclosure,warning,detail)'));
  assert.ok(source.includes('warning.hidden = entries.length === 0'));
});
test('comparison controls constrain long labels and expose keyboard focus',()=>{
  const css=fs.readFileSync(new URL('../public/entry-cases/__entry_v3_site__/workbench.css',import.meta.url),'utf8');
  assert.ok(css.includes('.profile-comparisons'));
  assert.ok(css.includes('[data-comparison-profile]:focus'));
});
test('ordinary comparison UI is mounted and uses a shared rail without primary selection handlers',()=>{
  assert.match(source,/function mountProfileComparisons\(/);
  assert.match(source,/Comparison \$\{/);
  assert.match(source,/data-comparison-profile/);
  assert.ok(source.includes('comparisonUi.detail.textContent = ""'), 'state updates clear the previous comparison tooltip');
});
test('primary rendering ignores stale success and stale error after B replaces A', async()=>{
  const body=source.slice(source.indexOf('async function renderProfile(index)'),source.indexOf('\nfunction profileIndexForId'));
  for(const lateFailure of [false,true]) {
    const pending=[];
    const state={profiles:[{profile_id:'A',shard_id:'A'},{profile_id:'B',shard_id:'B'}],caseData:{default_render_strand_id:'P',strands:[{strand_id:'P',sequence:'A'}]},residueByKey:new Map()};
    const node={setAttribute(){},innerHTML:'',value:'',textContent:''};
    const env={state,performance,primaryRequestId:0,primaryLoading:false,comparisonController:null,
      loadShard:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),profileValues:()=>[1],
      normalizeReactivityProfile:()=>({cap:1}),computeDmsLoopRecall(){},lssContextForProfile(){},recolorVarnaSvg:()=>'',
      el:{varnaViewport:{...node},molstarHost:{...node},molstarMeta:{...node},stats:{...node},select:{...node}},
      fitVarnaSvg(){},wireVarnaEvents(){},activeChainKey(){},materializedSequenceAlignment(){},activeStrand:()=>({sequence:'A'}),
      conciseMolstarMeta(){},metric(){},updateView(){},renderTrackRail(){},renderInspector(){},applyMolstarTargetDisplay(){},
      refreshProfileDropdownTrigger(){},renderComparisonControls(){},updateComparisonContext(){},showPrimaryError(){},
    };
    vm.createContext(env); vm.runInContext(body,env);
    const a=env.renderProfile(0); const b=env.renderProfile(1);
    pending[1].resolve({}); await b; assert.equal(state.lastRender.profile.profile_id,'B');
    if(lateFailure) pending[0].reject(Error('late A')); else pending[0].resolve({});
    await a; assert.equal(state.lastRender.profile.profile_id,'B');
  }
});
