import { createClient, createAccount } from 'genlayer-js';
import { TransactionStatus, type Hash } from 'genlayer-js/types';
import { studionet } from 'genlayer-js/chains';
import { readFile, writeFile } from 'node:fs/promises';
import { executionSucceeded } from '../src/lib/chain';

const key = process.env.GENLAYER_DEPLOYER_KEY;
if (!key) throw new Error('Missing deployment key');
const client = createClient({ chain: studionet, account: createAccount(key as `0x${string}`) });
const path = 'deployments/studionet.json';
const state = JSON.parse(await readFile(path, 'utf8')) as { network: string; chainId: number; contracts: Record<string, string>; transactions: Record<string, string> };
for (const [name, file] of [['registry', 'work_registry'], ['desk', 'licence_desk'], ['court', 'infringement_court']]) {
  if (state.contracts[name]) {
    await client.getContractSchema(state.contracts[name] as `0x${string}`);
    console.log(`${name}: existing deployment verified`);
    continue;
  }
  const args = name === 'registry' ? [] : name === 'desk' ? [state.contracts.registry] : [state.contracts.registry, state.contracts.desk, 10000000000000000n];
  let hash = state.transactions[name] as `0x${string}` | undefined;
  if (!hash) {
    hash = await client.deployContract({ code: await readFile(`contracts/${file}.py`, 'utf8'), args });
    state.transactions[name] = hash;
    await writeFile(path, JSON.stringify(state, null, 2) + '\n');
    console.log(`${name}: submitted ${hash}`);
  }
  const tx = await client.waitForTransactionReceipt({ hash: hash as Hash, status: TransactionStatus.ACCEPTED, interval: 6000, retries: 100 });
  if (!executionSucceeded(tx)) {
    console.log({name,hash,status:tx.statusName||tx.status,execution:tx.txExecutionResultName});
    throw new Error(`${name}: execution failed; inspect receipt before resubmitting`);
  }
  const address = tx.to_address || tx.recipient || (tx.data?.contractAddress as string);
  if (!address) throw new Error(`${name}: receipt has no contract address`);
  state.contracts[name] = address;
  await writeFile(path, JSON.stringify(state, null, 2) + '\n');
  await client.getContractSchema(address as `0x${string}`);
  console.log(`${name}: deployed ${address}`);
}
