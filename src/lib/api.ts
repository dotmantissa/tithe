import { randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { database } from './db';
import { accountFor, chain, read } from './chain';
import { authenticate, checkOrigin, digest, limit, readJSON } from './security';
import { AppError, failure } from './errors';
import { inspectArtifact } from './artifacts';
import { actionSchema } from './schemas';
import { submit, refreshOperation } from './operations';
import { syncIndex } from './indexer';
import type { Licence, Claim, Work } from './types';

const json=(data: unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function searchWorks(query='',kind='',offset=0) {
  const sql=database();
  const rows=await sql`SELECT document FROM tithe_works WHERE (${query}='' OR to_tsvector('english',title || ' ' || (document->'terms'->>'terms_text')) @@ plainto_tsquery('english',${query})) AND (${kind}='' OR kind=${kind}) ORDER BY (document->>'registered_at')::bigint DESC,id LIMIT 21 OFFSET ${offset}`;
  return {works:rows.slice(0,20).map(r=>r.document as Work),has_more:rows.length>20,offset};
}
let statsCache:{expires:number;value:unknown}|undefined;
let statsFlight:Promise<unknown>|undefined;
async function statistics(){
  if(statsCache&&statsCache.expires>Date.now())return statsCache.value;
  if(statsFlight)return statsFlight;
  statsFlight=(async()=>{
    const [works,licences,claims,desk,court]=await Promise.all([read<number>('registry','get_count'),read<number>('desk','get_count'),read<number>('court','get_count'),read<{escrow_atto:string}>('desk','get_account',['0x'+'0'.repeat(40)]),read<{escrow_atto:string}>('court','get_account',['0x'+'0'.repeat(40)])]);
    const value={works,licences,claims,escrow_atto:(BigInt(desk.escrow_atto)+BigInt(court.escrow_atto)).toString(),network:'GenLayer Studio'};
    statsCache={expires:Date.now()+60000,value};return value;
  })();
  try{return await statsFlight;}finally{statsFlight=undefined;}
}
export async function handle(request: Request, segments: string[]) {
  try {
    const url=new URL(request.url),path=segments.join('/');
    if(request.method==='GET') {
      if(path==='works') return json(await searchWorks(url.searchParams.get('q')?.slice(0,200)||'',url.searchParams.get('kind')||'',Math.max(0,Number(url.searchParams.get('offset'))||0)));
      if(segments[0]==='works'&&segments[1]) {
        const work=await read<Work>('registry','get_work',[z.string().regex(/^[a-f0-9]{64}$/).parse(segments[1])]);
        const version=url.searchParams.get('version');
        if(version) return json({...work,version:z.coerce.number().int().positive().parse(version),terms:await read('registry','get_terms',[work.work_id,Number(version)])});
        return json(work);
      }
      if(path==='stats') return json(await statistics());
      if(path==='docket') {
        const rows=await database()`SELECT document FROM tithe_records WHERE kind='claim' ORDER BY (document->>'filed_at')::bigint DESC LIMIT 100`;
        return json({claims:rows.map(r=>r.document)});
      }
      if(segments[0]==='docket'&&segments[1]) return json(await read('court','get_claim',[z.string().regex(/^[a-f0-9]{64}$/).parse(segments[1])]));
      if(segments[0]==='licences'&&segments[1]) return json(await read('desk','get_licence',[z.string().regex(/^[a-f0-9]{64}$/).parse(segments[1])]));
      const subject=await authenticate(request,path!=='keys');
      if(path==='account') {
        const account=accountFor(subject);
        const [balance,desk,court,records,operations,owned]=await Promise.all([
          chain.getBalance({address:account.address}),read<{credit_atto:string}>('desk','get_account',[account.address]),read<{credit_atto:string;bond_atto:string}>('court','get_account',[account.address]),
          database()`SELECT kind,document FROM tithe_records WHERE lower(account)=lower(${account.address}) OR lower(document->>'creator')=lower(${account.address}) OR lower(document->>'respondent')=lower(${account.address}) LIMIT 200`,
          database()`SELECT id,kind,status,tx_hash,error,created_at FROM tithe_operations WHERE subject=${subject} ORDER BY created_at DESC LIMIT 30`,
          database()`SELECT document FROM tithe_works WHERE lower(creator)=lower(${account.address}) ORDER BY indexed_at DESC LIMIT 200`,
        ]);
        return json({address:account.address,balance_atto:balance.toString(),credit_atto:desk.credit_atto,court_credit_atto:court.credit_atto,bond_atto:court.bond_atto,works:owned.map(r=>r.document),licences:records.filter(r=>r.kind==='licence').map(r=>r.document as Licence),claims:records.filter(r=>r.kind==='claim').map(r=>r.document as Claim),operations});
      }
      if(segments[0]==='operations'&&segments[1]) return json(await refreshOperation(subject,z.string().uuid().parse(segments[1])));
      if(path==='keys') return json({keys:await database()`SELECT id,name,prefix,created_at FROM tithe_keys WHERE subject=${subject} AND revoked_at IS NULL ORDER BY created_at DESC`});
    }
    if(request.method==='POST') {
      checkOrigin(request);
      if(path==='sync') {
        if(request.headers.get('authorization')!==`Bearer ${process.env.INDEXER_SECRET}` || !process.env.INDEXER_SECRET) throw new AppError('Unauthorized.',401);
        await syncIndex();return json({synced:true});
      }
      const subject=await authenticate(request,path!=='keys');
      if(path==='artifacts') {
        await limit(subject+':artifacts',10);
        const body=z.object({url:z.string().max(2048)}).parse(await readJSON(request));
        return json(await inspectArtifact(body.url));
      }
      if(path==='actions') return json(await submit(subject,actionSchema.parse(await readJSON(request)),request.headers.get('idempotency-key')||''),202);
      if(path==='keys') {
        await limit(subject+':keys',5);
        const {name}=z.object({name:z.string().trim().min(1).max(80)}).parse(await readJSON(request));
        const token='tithe_'+randomBytes(32).toString('hex'),id=randomUUID();
        await database()`INSERT INTO tithe_keys(id,subject,name,digest,prefix) VALUES(${id},${subject},${name},${digest(token)},${token.slice(0,14)})`;
        return json({id,token,name},201);
      }
      if(path==='credits') {
        // Studio's faucet changes actual remote test balances. No app ledger.
        await limit(subject+':credits',1,86400000);
        const account=accountFor(subject);
        await chain.request({method:'sim_fundAccount',params:[account.address,100000000000000000]});
        return json({balance_atto:(await chain.getBalance({address:account.address})).toString()});
      }
    }
    if(request.method==='DELETE'&&segments[0]==='keys'&&segments[1]) {
      checkOrigin(request);const subject=await authenticate(request,false);
      await database()`UPDATE tithe_keys SET revoked_at=now() WHERE id=${z.string().uuid().parse(segments[1])} AND subject=${subject}`;
      return json({revoked:true});
    }
    throw new AppError('That endpoint does not exist.',404);
  } catch(error) { return failure(error); }
}
