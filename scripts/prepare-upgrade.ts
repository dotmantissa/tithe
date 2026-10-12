import {readFile,writeFile,rename} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chain} from '../src/lib/chain';
const path='deployments/studionet.json',state=JSON.parse(await readFile(path,'utf8'));
const hashes:Record<string,string>={};
for(const [name,file] of [['registry','work_registry'],['desk','licence_desk'],['court','infringement_court']])hashes[name]=createHash('sha256').update(await readFile('contracts/'+file+'.py')).digest('hex');
if(JSON.stringify(state.source_sha256)===JSON.stringify(hashes)){console.log('This source revision already has a recovery manifest.');process.exit(0);}
for(const [name,address] of Object.entries(state.contracts)){
 assert.equal(await chain.readContract({address:address as `0x${string}`,functionName:'get_count',args:[],jsonSafeReturn:true}),0,'Existing application records require an explicit migration.');
 assert.equal(await chain.getBalance({address:address as `0x${string}`}),0n,'Existing contract funds must be preserved.');
 console.log(name+': existing empty state and zero native balance verified');
}
state.previous_deployments.push({contracts:state.contracts,transactions:state.transactions,source_sha256:state.source_sha256||null,checked_at:new Date().toISOString(),reason:'Consensus, consent, evidence and recovery audit remediation. Existing application records and native balances verified empty before replacement.'});
state.contracts={};state.transactions={};state.source_sha256=hashes;
await writeFile(path+'.tmp',JSON.stringify(state,null,2)+'\n');await rename(path+'.tmp',path);
console.log('Preserved previous addresses and prepared the audited source deployment.');
