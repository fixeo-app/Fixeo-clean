import test from 'node:test';
import assert from 'node:assert/strict';
import { proposedCity, cityProposal, needFacts, confirmedMetierHint } from '../lib/clientNeedFacts';
import { recoverEstimator } from '../lib/estimatorRecovery';

test('B2 city proposal is canonical, bounded by words, ambiguous-safe and subordinate to explicit selection', () => {
  assert.equal(proposedCity('Je cherche un plombier à Fès.'), 'Fès');
  assert.equal(proposedCity('Une fuite à fez'), 'Fès');
  assert.equal(proposedCity('Je parle de festivals'), undefined);
  assert.equal(proposedCity('Entre Rabat et Fès'), undefined);
  assert.deepEqual(cityProposal('Fuite à Fès', 'Rabat', true), { suggested: 'Fès', conflict: true, value: 'Rabat', confirmed: true });
  assert.deepEqual(cityProposal('Fuite à Fès', '', false), { suggested: 'Fès', conflict: false, value: 'Fès', confirmed: false });
  assert.equal(confirmedMetierHint('Électricité'), 'electricite');
  assert.equal(confirmedMetierHint('métier inventé'), undefined);
});

test('B2 versioned facts preserve provenance and dependency boundaries', () => {
  const facts = needFacts({ revision: 3, description: 'Fuite', descriptionConfirmed: false, city: 'Fès', cityConfirmed: false, cityProposed: true, service: 'Plomberie', serviceConfirmed: true });
  assert.equal(facts.revision, 3); assert.equal(facts.description.provenance, 'user_declared');
  assert.equal(facts.city.confirmed, false); assert.equal(facts.city.provenance, 'ai_inferred');
  assert.deepEqual(facts.city.dependencies, ['description']); assert.equal(facts.service.provenance, 'user_confirmed');
});

test('B2 expired estimator transports the confirmed trade hint, without replaying incompatible answers or confirming', async () => {
  const calls: any[] = [];
  const draft: any = { result: null, history: [], answer: '', started: true };
  await recoverEstimator(draft, { city: 'fes', description: 'Fuite', metierHint: 'plomberie', metierProvenance: 'user_confirmed' }, async action => {
    calls.push(action); return { ok: true, next_step: { type: 'METIER_SELECTION' } } as any;
  });
  assert.equal(calls.length, 1); assert.equal(calls[0].action, 'start');
  assert.equal(calls[0].entry_context.metier_hint, 'plomberie');
});


test('B2 actual 35-option picker retains the complete catalogue and searches accents without creating values', async () => {
  const { readFileSync } = await import('node:fs'); const { createRequire } = await import('node:module');
  const vm = await import('node:vm'); const ts = await import('typescript'); const require = createRequire(import.meta.url);
  const React = require('react'), renderer = require('react-test-renderer'); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const exports: any = {}; const deps: any = { 'react-native': { View:'view', Modal:'modal', SafeAreaView:'safe', FlatList:'list' },
    './KeyboardInput':{KeyboardInput:'input'}, './FixeoText':{FixeoText:'text'}, './FixeoAction':{FixeoAction:'action'}, './tokens': await import('../ui/tokens') };
  vm.runInNewContext(ts.transpileModule(readFileSync('ui/ChoicePicker.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports, require:(name:string)=>name.startsWith('react/') || name === 'react' ? require(name) : deps[name]});
  const options = Array.from({length:35},(_,i)=>({value:'s'+i,label:i === 34 ? 'Électricité spéciale' : 'Service '+i}));
  const values: string[] = []; let tree:any;
  await renderer.act(async()=>{ tree=renderer.create(React.createElement(exports.ChoicePicker,{label:'Service',options,value:'s30',onChange:(v:string)=>values.push(v)})); });
  assert.equal(tree.root.findAllByType('action').filter((x:any)=>x.props.selected !== undefined).length,3);
  assert.equal(tree.root.findByType('list').props.data.length,35);
  await renderer.act(async()=>tree.root.findAllByType('action').find((x:any)=>x.props.label.startsWith('Voir toutes')).props.onPress());
  assert.equal(tree.root.findByType('modal').props.visible,true);
  await renderer.act(async()=>tree.root.findByType('input').props.onChangeText('electricite'));
  const list=tree.root.findByType('list'); assert.equal(list.props.data.length,1);
  await renderer.act(async()=>list.props.renderItem({item:list.props.data[0]}).props.onPress());
  assert.deepEqual(values,['s34']); assert.equal(tree.root.findByType('modal').props.visible,false);
  await renderer.act(async()=>tree.unmount());
});
