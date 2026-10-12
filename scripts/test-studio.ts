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
    console.log({operation,details});
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
async function call<T>(name:string,method:string,args:CalldataEncodable[]=[]){return normalize<T>(await reader.readContract({address:state.contracts[name],functionName:method,args}));}
async function write(operation:string,who:typeof creator,name:string,method:string,args:CalldataEncodable[]=[],value=0n){
  if(state.results[operation])return;
  if(!state.transactions[operation]){
    console.log('Submitting '+operation);
    await clientFor(who,operation).writeContract({address:state.contracts[name],functionName:method,args,value});
  }
  return receipt(operation);
}
for(const account of [creator,lab]){
  if(await reader.getBalance({address:account.address})<10000000000000000n)await reader.request({method:'sim_fundAccount',params:[account.address,100000000000000000]});
}
const registry=await deploy('registry','work_registry',[]);
const desk=await deploy('desk','licence_desk',[registry]);
await deploy('court','infringement_court',[registry,desk,100]);
const sourceURL='https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/examples/contracts/llm_erc20.py';
if(!state.source){
  const response=await fetch(sourceURL,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);
  const raw=Buffer.from(await response.arrayBuffer());
  state.source={url:sourceURL,hash:createHash('sha256').update(raw).digest('hex')};await save();
}
const terms='Research, quotation, copying and commercial use of the registered example are all permitted without attribution under these terms. The entire registered example may be used.';
await write('register',creator,'registry','register_work',[state.source.url,state.source.hash,terms,'{"research":"0","commercial":"100"}','research','Studio integration verification']);
const works=await call<Work[]>('registry','list_works');assert.equal(works.length,1);assert.equal(works[0].content_hash,state.source.hash);assert.equal(works[0].terms.clauses.length,1);
const work=works[0];
await write('approve',lab,'desk','request_licence',[work.work_id,'Research by quoting the entire published example in our internal study.','research',work.version,'0']);
let licences=await call<Licence[]>('desk','list_licences');assert.equal(licences[0].decision,'APPROVE');assert.equal(licences[0].clause,'C1');assert.equal(licences[0].terms_version,1);
const usedAt=licences[0].issued_at;
await write('claim',creator,'court','file_claim',[work.work_id,state.source.url,state.source.hash,lab.address,usedAt],100n);
let claims=await call<Claim[]>('court','list_claims');assert.ok(['AWAITING_RESPONSE','READY','RULED'].includes(claims[0].status));
const claim=claims[0];
await write('respond',lab,'court','respond',[claim.claim_id,'',licences[0].licence_id],100n);
await write('rule',creator,'court','rule',[claim.claim_id]);
claims=await call<Claim[]>('court','list_claims');assert.equal(claims[0].ruling?.decision,'DERIVATIVE_WITHIN_TERMS');assert.equal(claims[0].ruling?.clause,'C1');assert.equal(claims[0].ruling?.damages_band,'NONE');assert.equal(claims[0].ruling?.distance_ppm,0);
await write('appeal',creator,'court','appeal_claim',[claim.claim_id],200n);
await write('review',lab,'court','rule',[claim.claim_id]);
claims=await call<Claim[]>('court','list_claims');assert.equal(claims[0].appeals?.length,1);assert.equal(claims[0].ruling?.decision,'DERIVATIVE_WITHIN_TERMS');
await write('terms',creator,'registry','update_terms',[work.work_id,'Commercial use is not permitted under this registered licence. All commercial licence requests must be refused.','{"commercial":"100"}','commercial']);
const oldTerms=await call<{terms_text:string}>('registry','get_terms',[work.work_id,1]);assert.equal(oldTerms.terms_text,terms);
await write('refuse',lab,'desk','request_licence',[work.work_id,'Use the entire example commercially in a competing paid product.','commercial',2,'100'],100n);
licences=await call<Licence[]>('desk','list_licences');assert.equal(licences[1].decision,'REFUSE');assert.equal(licences[1].clause,'C1');
const credit=await call<{credit_atto:string}>('desk','get_account',[lab.address]);
if(!state.transactions.withdraw)assert.equal(credit.credit_atto,'100');
await write('withdraw',lab,'desk','withdraw');
await receipt('withdraw',true);
assert.equal((await call<{credit_atto:string}>('desk','get_account',[lab.address])).credit_atto,'0');
const sourceHashes:Record<string,string>={};
for(const [name,file] of [['registry','work_registry'],['desk','licence_desk'],['court','infringement_court']]){const local=await readFile('contracts/'+file+'.py','utf8');assert.equal(await reader.getContractCode(state.contracts[name]),local);sourceHashes[name]=createHash('sha256').update(local).digest('hex');}
const reports={source_hashes:sourceHashes,network:'GenLayer Studio',checked_at:new Date().toISOString(),isolated_contracts:state.contracts,checks:state.results,ruling:claims[0].ruling,notes:['All web and model calls ran on the real network.','No sample work was registered in the application contracts.','Time gated settlement is covered by direct tests; live settlement waits two days.']};
await writeFile('deployments/studio-verification.json',JSON.stringify(reports,null,2)+'\n');
console.log('Studio integration checks passed: registry, live licensing, refusal refund, real ONNX embeddings, bonded review, and finalized withdrawal.');
