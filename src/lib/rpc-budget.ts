import {createHash} from 'node:crypto';
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
  const minute=Math.floor(Date.now()/60000),hour=Math.floor(Date.now()/3600000);
  for(const [scope,bucket,max] of [['studio:minute',minute,45],['studio:hour',hour,420]] as const){
   const rows=await sql`INSERT INTO tithe_limits(scope,bucket) VALUES(${scope},${bucket}) ON CONFLICT(scope,bucket) DO UPDATE SET count=tithe_limits.count+1 RETURNING count`;
   if(Number(rows[0].count)>max)throw new AppError('Studio is busy. Your saved requests will wait safely for the next network window.',429);
  }
  return original(input,{...init,signal:init?.signal||AbortSignal.timeout(25000)});
 };
}
export const cacheKey=(value:string)=>createHash('sha256').update(value).digest('hex');
