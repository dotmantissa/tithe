import {readFile,writeFile,rename} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chain} from '../src/lib/chain';
import {database} from '../src/lib/db';
import {TransactionHashVariant} from 'genlayer-js/types';
const path='deployments/studionet.json',state=JSON.parse(await readFile(path,'utf8'));
const hashes:Record<string,string>={};
for(const [name,file] of [['registry','work_registry'],['desk','licence_desk'],['court','infringement_court']])hashes[name]=createHash('sha256').update(await readFile('contracts/'+file+'.py')).digest('hex');
if(JSON.stringify(state.source_sha256)===JSON.stringify(hashes)){console.log('This source revision already has a recovery manifest.');process.exit(0);}
for(const [name,address] of Object.entries(state.contracts)){
 for(const transactionHashVariant of [TransactionHashVariant.LATEST_FINAL,TransactionHashVariant.LATEST_NONFINAL])assert.equal(await chain.readContract({address:address as `0x${string}`,functionName:'get_count',args:[],jsonSafeReturn:true,transactionHashVariant}),0,'Existing application records require an explicit migration.');
 const pending=await database()`SELECT count(*)::int AS count FROM tithe_operations WHERE contract_address=${address} AND status NOT IN ('FINALIZED','FAILED','ABORTED','CANCELED')`;
 assert.equal(Number(pending[0].count),0,'Pending application operations must be resolved before replacement.');
 assert.equal(await chain.getBalance({address:address as `0x${string}`}),0n,'Existing contract funds must be preserved.');
 console.log(name+': existing empty state and zero native balance verified');
}
state.previous_deployments.push({contracts:state.contracts,transactions:state.transactions,source_sha256:state.source_sha256||null,checked_at:new Date().toISOString(),reason:'Durable evidence, contextual adjudication and finalized receipts review. Both finalized and nonfinal counts, pending managed operations and native balances checked empty before replacement.'});
state.contracts={};state.transactions={};state.source_sha256=hashes;
await writeFile(path+'.tmp',JSON.stringify(state,null,2)+'\n');await rename(path+'.tmp',path);
console.log('Preserved previous addresses and prepared the audited source deployment.');
