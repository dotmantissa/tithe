import './network';
import './rpc-budget';
import {cacheKey} from './rpc-budget';
import {database} from './db';
import {AppError} from './errors';
import {rpcClass} from './rpc-context';
import { createClient, createAccount } from 'genlayer-js';
import { TransactionHashVariant, TransactionStatus, transactionResultNumberToName, transactionsStatusNumberToName, type CalldataEncodable, type GenLayerTransaction } from 'genlayer-js/types';
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
const flights=new Map<string,Promise<unknown>>();
const lookups:Record<string,string>={get_work:'lookup_work',get_licence:'lookup_licence',get_claim:'lookup_claim',get_terms:'lookup_terms'};
type CacheEntry={found:boolean;record?:unknown};
export async function read<T>(contract: ContractName, method: string, args: CalldataEncodable[] = [],fresh=false,variant=TransactionHashVariant.LATEST_FINAL): Promise<T> {
  const address = addresses[contract] as `0x${string}`;
  if (!address) throw new Error('The Studio contracts have not been deployed');
  const key=cacheKey('v2:'+variant+':'+address+':'+method+':'+JSON.stringify(args,(_,v)=>typeof v==='bigint'?v.toString():v));
  const unwrap=(entry:CacheEntry):T=>{
    if(!entry.found)throw new AppError('This record is not available in finalized state yet. Wait for finalization and try again.',404);
    return entry.record as T;
  };
  const sql=process.env.DATABASE_URL?database():null;
  if(sql&&!fresh){const cached=await sql`SELECT value FROM tithe_rpc_cache WHERE id=${key} AND expires_at>now()`;if(cached[0])return unwrap(cached[0].value as CacheEntry);}
  const flightKey=key+':'+rpcClass();
  if(flights.has(flightKey))return flights.get(flightKey) as Promise<T>;
  const promise=(async()=>{
    const lookup=lookups[method];
    const result=normalize<unknown>(await chain.readContract({address,functionName:lookup||method,args,jsonSafeReturn:true,transactionHashVariant:variant}));
    const entry:CacheEntry=lookup?result as CacheEntry:{found:true,record:result};
    if(typeof entry?.found!=='boolean'||(entry.found&&!('record' in entry)))throw new Error('Invalid chain lookup response');
    // Only explicit contract membership results can prove absence. RPC failures
    // are never cached as missing. Final/nonfinal caches have distinct keys.
    if(sql)await sql`INSERT INTO tithe_rpc_cache(id,value,expires_at) VALUES(${key},${JSON.stringify(entry)}::jsonb,now()+${entry.found?15:30}*interval '1 second') ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value,expires_at=EXCLUDED.expires_at`;
    return unwrap(entry);
  })();
  flights.set(flightKey,promise);
  try{return await promise;}finally{flights.delete(flightKey);}
}
export function executionSucceeded(tx: GenLayerTransaction): boolean {
  const data=normalize<Record<string,unknown>>(tx);
  const outcome=String(data.resultName||data.result_name||transactionResultNumberToName[String(data.result) as keyof typeof transactionResultNumberToName]||'');
  // A successful candidate execution does not mean validators accepted it.
  // Studio can FINALIZE MAJORITY_DISAGREE and apply no state at all.
  if(outcome&&!['MAJORITY_AGREE','SUCCESS'].includes(outcome))return false;
  if(tx.txExecutionResultName!==undefined)return tx.txExecutionResultName==='FINISHED_WITH_RETURN';
  if(tx.txExecutionResult!==undefined)return tx.txExecutionResult===1;
  if(!['MAJORITY_AGREE','SUCCESS'].includes(outcome))return false;
  const consensus=data.consensus_data as {leader_receipt?:{mode?:string;execution_result?:string}[]} | undefined;
  const receipts=consensus?.leader_receipt||[];
  const leader=receipts.filter(r=>r.mode==='leader').at(-1)||receipts[0];
  return leader?.execution_result==='SUCCESS';
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
