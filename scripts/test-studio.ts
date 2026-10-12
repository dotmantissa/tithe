import '../src/lib/network';
import assert from 'node:assert/strict';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { keccak256 } from 'viem';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus, type Hash, type CalldataEncodable } from 'genlayer-js/types';
import { accountFor, executionSucceeded, normalize } from '../src/lib/chain';
import type { Work, Licence, Claim } from '../src/lib/types';

type State={contracts:Record<string,`0x${string}`>;transactions:Record<string,Hash>;signed:Record<string,`0x${string}`>;source?:{url:string;hash:string};results:Record<string,unknown>};
await mkdir('.secrets',{recursive:true});
const run=process.env.STUDIO_TEST_RUN||'v1';
if(!/^[a-zA-Z0-9_]{1,40}$/.test(run))throw new Error('Invalid test run identifier');
const statePath='.secrets/studio-test-state'+(run==='v1'?'':'-'+run)+'.json';
let state:State;
try {state=JSON.parse(await readFile(statePath,'utf8'));}catch{state={contracts:{},transactions:{},signed:{},results:{}};}
async function save(){await writeFile(statePath+'.tmp',JSON.stringify(state,null,2)+'\n',{mode:0o600});await rename(statePath+'.tmp',statePath);}
const creator=accountFor('tithe:integration:creator:'+run),lab=accountFor('tithe:integration:lab:'+run);
function clientFor(who:typeof creator,operation:string){
  const sign=who.signTransaction;
  return createClient({chain:studionet,account:{...who,signTransaction:async(...args:Parameters<typeof sign>)=>{
    const raw=await sign(...args);state.signed[operation]=raw;state.transactions[operation]=keccak256(raw) as Hash;await save();return raw;
  }}});
}
const reader=createClient({chain:studionet});
async function retry<T>(action:()=>Promise<T>):Promise<T>{for(let attempt=0;;attempt++){try{return await action();}catch{if(attempt>=5)throw new Error('A real service is temporarily unavailable. Resume the saved integration run.');await new Promise(resolve=>setTimeout(resolve,5000));}}}
const balance=(address:`0x${string}`)=>retry(()=>reader.getBalance({address}));
async function receipt(operation:string,final=false){
  const hash=state.transactions[operation];
  assert.ok(hash,operation+' has a persisted transaction');
  let tx;
  for(let attempt=0;attempt<6;attempt++) {
    try{tx=await reader.waitForTransactionReceipt({hash,status:final?TransactionStatus.FINALIZED:TransactionStatus.ACCEPTED,interval:10000,retries:90});break;}
    catch(error){if(attempt===5)throw error;console.log(operation+': reconnecting to Studio');await new Promise(resolve=>setTimeout(resolve,5000));}
  }
  assert.ok(tx);
  if(!executionSucceeded(tx)){
    const details=tx.consensus_data?.leader_receipt?.map(item=>({execution:item.execution_result,result:item.result}));
    console.log({operation,details:JSON.stringify(details)});
    throw new Error(operation+' execution failed');
  }
  state.results[operation]={hash,status:tx.statusName||tx.status,execution:'succeeded'};await save();return tx;
}
async function deploy(name:string,file:string,args:CalldataEncodable[]){
  const operation='deploy:'+name;
  if(state.contracts[name]&&state.results[operation])return state.contracts[name];
  if(!state.transactions[operation]){
    console.log('Deploying isolated '+name+' test contract');
    await clientFor(creator,operation).deployContract({code:await readFile('contracts/'+file+'.py','utf8'),args});
  }
  const tx=await receipt(operation);
  const address=tx.to_address||tx.recipient;
  assert.ok(address);
  state.contracts[name]=address;await save();
  await reader.getContractSchema(address);
  return address;
}
async function call<T>(name:string,method:string,args:CalldataEncodable[]=[]){return normalize<T>(await retry(()=>reader.readContract({address:state.contracts[name],functionName:method,args})));}
async function write(operation:string,who:typeof creator,name:string,method:string,args:CalldataEncodable[]=[],value=0n){
 if(state.results[operation])return;
 if(value>0n){
  const credit=await call<{credit_atto:string}>(name,'get_account',[who.address]);
  const shortfall=value-BigInt(credit.credit_atto);
  if(shortfall>0n){const funding=operation+':fund';if(!state.transactions[funding])await clientFor(who,funding).writeContract({address:state.contracts[name],functionName:'fund_credit',args:[],value:shortfall});await receipt(funding,true);}
 }
 if(!state.transactions[operation]){console.log('Submitting '+operation);await clientFor(who,operation).writeContract({address:state.contracts[name],functionName:method,args,value:0n});}
 if(state.signed[operation]){try{await retry(()=>reader.getTransaction({hash:state.transactions[operation]}));}catch{await reader.sendRawTransaction({serializedTransaction:state.signed[operation]});}}
 return receipt(operation);
}
for(const account of [creator,lab]){
  if(await balance(account.address)<10000000000000000n)await reader.request({method:'sim_fundAccount',params:[account.address,100000000000000000]});
}
const registry=await deploy('registry','work_registry',[]);
const desk=await deploy('desk','licence_desk',[registry,10]);
await deploy('court','infringement_court',[registry,desk,100,3600,3600,1200]);
assert.equal((await call<{escrow_seconds:number}>('desk','get_config')).escrow_seconds,10);
assert.equal((await call<{appeal_seconds:number}>('court','get_config')).appeal_seconds,1200);
const hash=(raw:Buffer)=>createHash('sha256').update(raw).digest('hex');
async function artifact(url:string){const response=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);const raw=Buffer.from(await response.arrayBuffer());return {url,hash:hash(raw)};}
const text=await artifact('https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/examples/contracts/llm_erc20.py');
const other=await artifact('https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/examples/contracts/user_storage.py');
const image=await artifact('https://raw.githubusercontent.com/python-pillow/Pillow/main/Tests/images/hopper.png');
const imageOther=await artifact('https://raw.githubusercontent.com/python-pillow/Pillow/main/Tests/images/hopper.webp');
const permitted='Research and commercial copying of all or part of this work are permitted without attribution. Commercial use requires the published commercial fee. Research use is free.';
const prohibited='All copying, quotation and commercial use of this work are prohibited. Refuse every request to copy this work.';
await write('register:text',creator,'registry','register_work',[text.url,text.hash,permitted,'{"research":"0","commercial":"100"}','commercial','Isolated text verification']);
let works=await call<Work[]>('registry','list_works',[0,50]);const work=works.find(w=>w.content_hash===text.hash)!;assert.ok(work);
await write('approve:paid',lab,'desk','request_licence',[work.work_id,'Commercial copying of the entire published work in a paid product.','commercial',1,'100','studio-paid-approval-'+run],100n);
let licences=await call<Licence[]>('desk','list_licences',[0,50]);const paid=licences.find(l=>l.intended_use.startsWith('Commercial copying'))!;assert.equal(paid.decision,'APPROVE');
async function waitUntil(epoch:number){for(;;){const clock=await call<{unix_seconds:number}>('registry','get_clock');if(clock.unix_seconds>=epoch)return;await new Promise(resolve=>setTimeout(resolve,Math.min(30000,(epoch-clock.unix_seconds)*1000+100)));}}
await waitUntil(paid.release_at);
await write('release:paid',creator,'desk','release_fee',[paid.licence_id]);
if(!state.transactions['withdraw:paid'])assert.equal((await call<{credit_atto:string}>('desk','get_account',[creator.address])).credit_atto,'100');
if(!state.results['withdraw:paid:balance']){const before=await balance(creator.address);await write('withdraw:paid',creator,'desk','withdraw');await receipt('withdraw:paid',true);const after=await balance(creator.address);assert.equal(after-before,100n);state.results['withdraw:paid:balance']={received_atto:'100'};await save();}
if(!state.results['failed-action:balance']){
 const funding='failed-action:fund';if(!state.transactions[funding])await clientFor(lab,funding).writeContract({address:desk,functionName:'fund_credit',args:[],value:100n});await receipt(funding,true);
 const failure='failed-action';if(!state.transactions[failure])await clientFor(lab,failure).writeContract({address:desk,functionName:'request_licence',args:[work.work_id,'Commercial copying with an intentionally stale consent version.','commercial',99,'100','studio-failure-safety-'+run],value:0n});
 const tx=await reader.waitForTransactionReceipt({hash:state.transactions[failure],status:TransactionStatus.FINALIZED,interval:10000,retries:90});assert.equal(executionSucceeded(tx),false);
 assert.equal((await call<{credit_atto:string}>('desk','get_account',[lab.address])).credit_atto,'100');
 const before=await balance(lab.address);await write('failed-action:withdraw',lab,'desk','withdraw');await receipt('failed-action:withdraw',true);assert.equal(await balance(lab.address)-before,100n);
 state.results[failure]={hash:state.transactions[failure],status:'FINALIZED',execution:'expected rollback with zero attached value'};state.results['failed-action:balance']={recovered_atto:'100'};await save();
}
// A real nonidentical text pair exercises ONNX rather than the identical-body fast path.
await write('claim:distinct',creator,'court','file_claim',[work.work_id,other.url,other.hash,lab.address,paid.issued_at,1,'studio-distinct-claim-'+run],100n);
let claims=await call<Claim[]>('court','list_claims',[0,50]);const distinct=claims.find(c=>c.output_hash===other.hash)!;
await write('respond:distinct',lab,'court','respond',[distinct.claim_id,'','',distinct.used_at,1,''],100n);
await write('rule:distinct',creator,'court','rule',[distinct.claim_id]);
let ruled=await call<Claim>('court','get_claim',[distinct.claim_id]);assert.ok(ruled.ruling);assert.ok(ruled.ruling.distance_ppm>0);assert.ok(['NO_USE','DERIVATIVE_WITHIN_TERMS'].includes(ruled.ruling.decision));assert.equal(ruled.ruling.damages_band,'NONE');
await write('appeal:distinct',creator,'court','appeal_claim',[distinct.claim_id],200n);
if(!state.transactions['review:distinct']){const pending=await call<Claim>('court','get_claim',[distinct.claim_id]);assert.equal(pending.status,'REVIEW_PENDING');assert.ok(pending.ruling);}
await write('review:distinct',lab,'court','rule',[distinct.claim_id]);
ruled=await call<Claim>('court','get_claim',[distinct.claim_id]);assert.equal(ruled.status,'RULED');assert.equal(ruled.appeals?.[0].outcome,'REVIEWED');
await write('terms:prohibit',creator,'registry','update_terms',[work.work_id,prohibited,'{"commercial":"100"}','commercial']);
const current=await call<Work>('registry','get_work',[work.work_id]);assert.equal(current.version,2);
await write('refuse:paid',lab,'desk','request_licence',[work.work_id,'Commercial copying of the full work despite the prohibition.','commercial',2,'100','studio-refused-request-'+run],100n);
licences=await call<Licence[]>('desk','list_licences',[0,50]);assert.equal(licences.find(l=>l.terms_version===2)?.decision,'REFUSE');
if(!state.results['withdraw:refused:balance']){const before=await balance(lab.address);await write('withdraw:refused',lab,'desk','withdraw');await receipt('withdraw:refused',true);assert.equal(await balance(lab.address)-before,100n);state.results['withdraw:refused:balance']={received_atto:'100'};await save();}
const usedAt=current.terms.effective_at;
await write('claim:grant',creator,'court','file_claim',[work.work_id,text.url,text.hash,lab.address,usedAt,2,'studio-durable-grant-'+run],100n);
claims=await call<Claim[]>('court','list_claims',[0,50]);const grant=claims.find(c=>c.output_hash===text.hash)!;
await write('respond:grant',lab,'court','respond',[grant.claim_id,'',paid.licence_id,usedAt,2,''],100n);
await write('rule:grant',creator,'court','rule',[grant.claim_id]);
const grantRuling=await call<Claim>('court','get_claim',[grant.claim_id]);assert.equal(grantRuling.ruling?.decision,'DERIVATIVE_WITHIN_TERMS');assert.equal(grantRuling.ruling?.terms_basis,'LICENCE_TERMS');assert.equal(grantRuling.ruling?.terms_version,1);
// A separate still image work exercises actual decode, vision and visual signature embeddings.
await write('register:image',creator,'registry','register_work',[image.url,image.hash,'All copying and derivative uses of this image are permitted without attribution.','{"research":"0"}','research','Isolated still image verification']);
works=await call<Work[]>('registry','list_works',[0,50]);const visual=works.find(w=>w.content_hash===image.hash)!;assert.equal(visual.kind,'image');
await write('approve:image',lab,'desk','request_licence',[visual.work_id,'Research comparison using the entire image and a converted version.','research',1,'0','studio-image-licence-'+run]);
licences=await call<Licence[]>('desk','list_licences',[0,50]);assert.equal(licences.find(l=>l.work_id===visual.work_id)?.decision,'APPROVE');
await write('claim:image',creator,'court','file_claim',[visual.work_id,imageOther.url,imageOther.hash,lab.address,visual.registered_at,1,'studio-image-claim-'+run],100n);
claims=await call<Claim[]>('court','list_claims',[0,50]);const visualClaim=claims.find(c=>c.work_id===visual.work_id)!;
await write('respond:image',lab,'court','respond',[visualClaim.claim_id,'','',visualClaim.used_at,1,''],100n);
await write('rule:image',creator,'court','rule',[visualClaim.claim_id]);
const visualRuling=await call<Claim>('court','get_claim',[visualClaim.claim_id]);assert.equal(visualRuling.ruling?.decision,'DERIVATIVE_WITHIN_TERMS');assert.equal(visualRuling.ruling?.damages_band,'NONE');
// No grant is supplied for this prohibited copy; the exact band drives real settlement.
await write('claim:prohibited',creator,'court','file_claim',[work.work_id,text.url,text.hash,lab.address,usedAt,2,'studio-prohibited-copy-'+run],100n);
claims=await call<Claim[]>('court','list_claims',[0,50]);const prohibitedClaim=claims.find(c=>c.work_id===work.work_id&&c.claim_id!==grant.claim_id&&c.output_hash===text.hash)!;
await write('respond:prohibited',lab,'court','respond',[prohibitedClaim.claim_id,'','',usedAt,2,''],100n);
await write('rule:prohibited',creator,'court','rule',[prohibitedClaim.claim_id]);
const prohibitedRuling=await call<Claim>('court','get_claim',[prohibitedClaim.claim_id]);assert.equal(prohibitedRuling.ruling?.decision,'USE');assert.ok(['LOW','MEDIUM','HIGH'].includes(prohibitedRuling.ruling!.damages_band));
for(const c of [distinct,grant,visualClaim,prohibitedClaim]){const latest=await call<Claim>('court','get_claim',[c.claim_id]);await waitUntil(latest.settle_after!);await write('settle:'+c.claim_id,creator,'court','settle',[c.claim_id]);assert.equal((await call<Claim>('court','get_claim',[c.claim_id])).status,'SETTLED');}
assert.equal((await call<{escrow_atto:string}>('court','get_account',[creator.address])).escrow_atto,'0');
for(const [name,who] of [['creator',creator],['lab',lab]] as const){
 const op='withdraw:court:'+name;
 if(!state.results[op+':balance']){const credit=await call<{credit_atto:string}>('court','get_account',[who.address]);const before=await balance(who.address);await write(op,who,'court','withdraw');await receipt(op,true);assert.equal(await balance(who.address)-before,BigInt(credit.credit_atto));state.results[op+':balance']={received_atto:credit.credit_atto};await save();}
 assert.equal((await call<{credit_atto:string}>('court','get_account',[who.address])).credit_atto,'0');
}
assert.equal(await balance(state.contracts.court),0n);
const sourceHashes:Record<string,string>={};
for(const [name,file] of [['registry','work_registry'],['desk','licence_desk'],['court','infringement_court']]){const local=await readFile('contracts/'+file+'.py','utf8');assert.equal(await reader.getContractCode(state.contracts[name]),local);sourceHashes[name]=createHash('sha256').update(local).digest('hex');}
await writeFile('deployments/studio-verification.json',JSON.stringify({source_hashes:sourceHashes,network:'GenLayer Studio',checked_at:new Date().toISOString(),isolated_contracts:state.contracts,checks:state.results,nonidentical_text_ruling:ruled.ruling,image_ruling:visualRuling.ruling,durable_grant_ruling:grantRuling.ruling,prohibited_ruling:prohibitedRuling.ruling,notes:['Real public evidence, live independent model consensus and ONNX embeddings.','Isolated contracts use 10 second fee escrow and 1200 second appeals; application uses one day and two days.','Native funding is credited before adjudication; an intentionally reverted zero-value action retained credit and its full native withdrawal was verified.','All isolated court funds settled and withdrawn with exact native balance checks.','No sample works or licences registered in application contracts.']},null,2)+'\n');
console.log('Studio integration passed: paid approval and release, refusal refund, distinct text embeddings, live PNG/WebP vision, durable grant, bonded review, damages, timed settlement and native withdrawals.');
