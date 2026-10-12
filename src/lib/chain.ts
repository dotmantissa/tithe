import './network';
import './rpc-budget';
import {cacheKey} from './rpc-budget';
import {database} from './db';
import { createClient, createAccount } from 'genlayer-js';
import { TransactionStatus, transactionsStatusNumberToName, type CalldataEncodable, type GenLayerTransaction } from 'genlayer-js/types';
import { studionet } from 'genlayer-js/chains';
import { createHmac } from 'node:crypto';
import deployment from '../../deployments/studionet.json';

export type ContractName = 'registry'|'desk'|'court';
export const addresses=deployment.contracts as Record<ContractName,string>;
export const chain = createClient({ chain: studionet });
export function accountFor(subject: string) {
  const secret = process.env.ACCOUNT_DERIVATION_SECRET;
  if (!secret || secret.length < 64) throw new Error('Managed account service is not configured');
  return createAccount(`0x${createHmac('sha256', secret).update('tithe:studio:v1:' + subject).digest('hex')}`);
}
export function signer(subject: string, onSigned?: (raw: `0x${string}`) => Promise<void>) {
  const account=accountFor(subject);
  const signTransaction=account.signTransaction;
  const tracked=onSigned ? {...account, signTransaction: async (...args: Parameters<typeof signTransaction>) => {
    const raw=await signTransaction(...args);
    await onSigned(raw);
    return raw;
  }} : account;
  return createClient({chain:studionet,account:tracked});
}
export function normalize<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? (v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString()) : v instanceof Map ? Object.fromEntries(v) : v));
}
export async function read<T>(contract: ContractName, method: string, args: CalldataEncodable[] = [],fresh=false): Promise<T> {
  const address = addresses[contract] as `0x${string}`;
  if (!address) throw new Error('The Studio contracts have not been deployed');
  const key=cacheKey(address+':'+method+':'+JSON.stringify(args,(_,v)=>typeof v==='bigint'?v.toString():v));
  const sql=process.env.DATABASE_URL?database():null;
  if(sql&&!fresh){const cached=await sql`SELECT value FROM tithe_rpc_cache WHERE id=${key} AND expires_at>now()`;if(cached[0])return cached[0].value as T;}
  const value=normalize<T>(await chain.readContract({address,functionName:method,args,jsonSafeReturn:true}));
  if(sql)await sql`INSERT INTO tithe_rpc_cache(id,value,expires_at) VALUES(${key},${JSON.stringify(value)}::jsonb,now()+interval '15 seconds') ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value,expires_at=EXCLUDED.expires_at`;
  return value;
}
export function executionSucceeded(tx: GenLayerTransaction): boolean {
  if (tx.txExecutionResultName === 'FINISHED_WITH_RETURN' || tx.txExecutionResult === 1) return true;
  const data = normalize<Record<string, unknown>>(tx);
  const consensus = data.consensus_data as { leader_receipt?: { execution_result?: string }[] } | undefined;
  return consensus?.leader_receipt?.[0]?.execution_result === 'SUCCESS';
}
export { TransactionStatus };

export function operationState(tx:GenLayerTransaction):string{
  const raw=String(tx.statusName||tx.status||'PENDING');
  const status=transactionsStatusNumberToName[raw as keyof typeof transactionsStatusNumberToName]||raw;
  if(status==='CANCELED')return 'CANCELED';
  if(status==='UNDETERMINED')return 'UNDETERMINED';
  if(status==='FINALIZED'&&!executionSucceeded(tx))return 'FAILED';
  if(status==='ACCEPTED'&&!executionSucceeded(tx))return 'ACCEPTED_REJECTED';
  return status;
}
