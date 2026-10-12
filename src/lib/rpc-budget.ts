import {createHash} from 'node:crypto';
import {rpcClass} from './rpc-context';
import {rpcReservationQuery} from './rpc-reservation';
// The SDK uses fetch internally. Guard only this exact public Studio endpoint.
// Every wire call, including signing preparation, shares the database budget.
const endpoint='https://studio.genlayer.com/api';
const symbol=Symbol.for('tithe.rpc.fetch');
const globals=globalThis as typeof globalThis & {[symbol]?:boolean};
if(!globals[symbol]){
 globals[symbol]=true;const original=globalThis.fetch.bind(globalThis);
 globalThis.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(url!==endpoint||!process.env.DATABASE_URL)return original(input,init);
  const {database}=await import('./db'),{AppError}=await import('./errors');const sql=database();
  // A transaction lock serializes reservations; each SQL statement gets a
  // fresh snapshot after the lock. Fixed clock buckets can exceed a rolling
  // provider limit near the hour boundary, so meter the actual recent calls.
  const reservationQuery=rpcReservationQuery(rpcClass());
  const reservation=await sql.transaction([
   sql`SELECT pg_advisory_xact_lock(619990042)`,
   sql.query(reservationQuery.query,reservationQuery.params),
  ]).catch(()=>{throw new AppError('The network budget service is temporarily unavailable. Saved payments remain recoverable.',503);});
  if(!reservation[1].length)throw new AppError('Studio is busy. Saved requests will wait safely for the next network window.',429);
  return original(input,{...init,signal:init?.signal||AbortSignal.timeout(25000)});
 };
}
export const cacheKey=(value:string)=>createHash('sha256').update(value).digest('hex');
