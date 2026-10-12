import '../src/lib/network';
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chain,addresses,executionSucceeded,operationState,read } from '../src/lib/chain';
import type { ContractName } from '../src/lib/chain';
import deployment from '../deployments/studionet.json';
import type { Hash } from 'genlayer-js/types';
const checks:Record<string,unknown>={};
for(const [name,file] of [['registry','work_registry'],['desk','licence_desk'],['court','infringement_court']] as const){
  const local=await readFile('contracts/'+file+'.py','utf8');
  const deployed=await chain.getContractCode(addresses[name] as `0x${string}`);
  assert.equal(deployed,local,name+' source matches deployed bytes');
  const schema=await chain.getContractSchema(addresses[name] as `0x${string}`);
  assert.ok(schema);
  const transaction=await chain.getTransaction({hash:(deployment.transactions as Partial<Record<ContractName,string>>)[name] as Hash});
  assert.equal(operationState(transaction),'FINALIZED',name+' deployment is finalized');
  assert.ok(executionSucceeded(transaction),name+' deployment executed successfully');
  const snapshot=await read<{count:number;revision:number}>(name,'get_snapshot',[],true);
  if(name!=='registry'){const config=await read<Record<string,string|number>>(name,'get_config',[],true);assert.equal(String(config.registry).toLowerCase(),addresses.registry.toLowerCase());if(name==='desk')assert.equal(config.escrow_seconds,86400);else{assert.equal(String(config.desk).toLowerCase(),addresses.desk.toLowerCase());assert.equal(config.bond_atto,'10000000000000000');assert.equal(config.response_seconds,604800);assert.equal(config.hearing_seconds,86400);assert.equal(config.appeal_seconds,172800);}}
  checks[name]={snapshot,address:addresses[name],transaction:(deployment.transactions as Partial<Record<ContractName,string>>)[name],source_sha256:createHash('sha256').update(local).digest('hex'),source_matches:true,schema_verified:true,execution:'succeeded',records:await read<number>(name as ContractName,'get_count')};
  console.log(name+': deployed source, execution and live reads verified');
}
await writeFile('deployments/verification.json',JSON.stringify({network:'GenLayer Studio',checked_at:new Date().toISOString(),checks},null,2)+'\n');
