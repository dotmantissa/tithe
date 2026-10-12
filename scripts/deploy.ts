import {createClient,createAccount} from 'genlayer-js';
import {TransactionStatus,type Hash} from 'genlayer-js/types';
import {studionet} from 'genlayer-js/chains';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {keccak256,parseTransaction} from 'viem';
import {createHash} from 'node:crypto';
import {executionSucceeded} from '../src/lib/chain';
import {sealTransaction,openTransaction,validateSavedTransaction} from '../src/lib/outbox';
const key=process.env.GENLAYER_DEPLOYER_KEY;if(!key)throw new Error('Missing deployment key');
const account=createAccount(key as `0x${string}`),path='deployments/studionet.json',outboxPath='.secrets/deployment-outbox.json';
await mkdir('.secrets',{recursive:true,mode:0o700});
const state=JSON.parse(await readFile(path,'utf8'));
let outbox:Record<string,{ciphertext:string;hash:Hash;nonce:string}>;try{outbox=JSON.parse(await readFile(outboxPath,'utf8'));}catch{outbox={};}
async function save(){await writeFile(outboxPath+'.tmp',JSON.stringify(outbox),{mode:0o600});await rename(outboxPath+'.tmp',outboxPath);await writeFile(path+'.tmp',JSON.stringify(state,null,2)+'\n');await rename(path+'.tmp',path);}
const reader=createClient({chain:studionet});
for(const [name,file] of [['registry','work_registry'],['desk','licence_desk'],['court','infringement_court']]){
 const code=await readFile('contracts/'+file+'.py','utf8'),source=createHash('sha256').update(code).digest('hex'),id=name+':'+source;
 if(state.source_sha256?.[name]!==source)throw new Error('Prepare the source-bound upgrade manifest before deploying.');
 if(state.contracts[name]){if(await reader.getContractCode(state.contracts[name])!==code)throw new Error(name+': existing deployment differs from this source');console.log(name+': exact existing deployment verified');continue;}
 const args=name==='registry'?[]:name==='desk'?[state.contracts.registry]:[state.contracts.registry,state.contracts.desk,10000000000000000n];
 const saved=outbox[id];
 if(saved){
  state.transactions[name]=saved.hash;await save();
  const raw=openTransaction(saved.ciphertext,'tithe:deployer',id);await validateSavedTransaction(raw,saved.hash,account.address,saved.nonce);
  let known=false;try{await reader.getTransaction({hash:saved.hash});known=true;}catch{/* identical signed replay only */}
  if(!known){try{await reader.sendRawTransaction({serializedTransaction:raw});}catch{await reader.getTransaction({hash:saved.hash});}}
 }else if(!state.transactions[name]){
  const sign=account.signTransaction;
  const client=createClient({chain:studionet,account:{...account,signTransaction:async(...params:Parameters<typeof sign>)=>{
   const raw=await sign(...params),hash=keccak256(raw) as Hash;
   outbox[id]={ciphertext:sealTransaction(raw,'tithe:deployer',id),hash,nonce:String(parseTransaction(raw).nonce)};state.transactions[name]=hash;await save();return raw;
  }}});
  await client.deployContract({code,args});console.log(name+': signed transaction saved and submitted');
 }
 const hash=state.transactions[name] as Hash;
 const tx=await reader.waitForTransactionReceipt({hash,status:TransactionStatus.FINALIZED,interval:10000,retries:150});
 if(!executionSucceeded(tx))throw new Error(name+': deployment execution failed. Inspect the saved receipt before proceeding.');
 const address=tx.to_address||tx.recipient;if(!address)throw new Error('Deployment receipt has no address');
 if(await reader.getContractCode(address)!==code)throw new Error('Deployed source mismatch');
 await reader.getContractSchema(address);state.contracts[name]=address;await save();console.log(name+': finalized and exact source verified '+address);
}
