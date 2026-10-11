import '../src/lib/network';
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chain,addresses,executionSucceeded,read } from '../src/lib/chain';
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
  const transaction=await chain.getTransaction({hash:deployment.transactions[name] as Hash});
  assert.ok(executionSucceeded(transaction),name+' deployment executed successfully');
  checks[name]={address:addresses[name],transaction:deployment.transactions[name],source_sha256:createHash('sha256').update(local).digest('hex'),source_matches:true,schema_verified:true,execution:'succeeded',records:await read<number>(name as ContractName,'get_count')};
  console.log(name+': deployed source, execution and live reads verified');
}
await writeFile('deployments/verification.json',JSON.stringify({network:'GenLayer Studio',checked_at:new Date().toISOString(),checks},null,2)+'\n');
