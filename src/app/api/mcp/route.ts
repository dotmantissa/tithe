import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, checkOrigin, limit, readJSON } from '@/lib/security';
import { failure, AppError } from '@/lib/errors';
import { searchWorks } from '@/lib/api';
import { inspectArtifact } from '@/lib/artifacts';
import { read } from '@/lib/chain';
import { submit, refreshOperation } from '@/lib/operations';
import { actionSchema } from '@/lib/schemas';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const tools=[
  {name:'search_works',description:'Search registered works and their public licence terms.',inputSchema:{type:'object',properties:{query:{type:'string'},kind:{type:'string',enum:['text','image','']}}}},
  {name:'get_work',description:'Read the authoritative work and current terms from GenLayer.',inputSchema:{type:'object',properties:{work_id:{type:'string'}},required:['work_id']}},
  {name:'inspect_artifact',description:'Fetch a public text or still image and compute its raw SHA256 commitment.',inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url']}},
  {name:'submit_action',description:'Register a work, request a licence, open or respond to a claim, obtain a ruling, withdraw credits, or appeal. Fees and bonds debit the authenticated account. Returns an operation to poll.',inputSchema:{type:'object',properties:{action:z.toJSONSchema(actionSchema),idempotency_key:{type:'string',minLength:16,maxLength:100}},required:['action','idempotency_key']}},
  {name:'operation_status',description:'Read submission and execution status. Poll until accepted or finalized, then read the corresponding chain record.',inputSchema:{type:'object',properties:{operation_id:{type:'string'}},required:['operation_id']}},
  {name:'read_docket',description:'Read a public claim, historical terms version, evidence commitments and ruling.',inputSchema:{type:'object',properties:{claim_id:{type:'string'}},required:['claim_id']}},
];
export async function POST(request:Request) {
  let id:unknown=null;
  try {
    checkOrigin(request);
    const subject=await authenticate(request);
    await limit(subject+':mcp',30);
    const body=z.object({jsonrpc:z.literal('2.0'),id:z.union([z.string(),z.number(),z.null()]).optional(),method:z.string(),params:z.record(z.string(),z.unknown()).optional()}).parse(await readJSON(request));
    id=body.id??null;
    if(body.method.startsWith('notifications/')) return new NextResponse(null,{status:202});
    let result:unknown;
    if(body.method==='initialize') result={protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'Tithe',version:'1.0.0'},instructions:'Tithe provides private licensing and arbitration on GenLayer Studio. These are test funds. Obtain user consent before fee or bond actions. Registered terms are public. A licence applies only to the approved intended use.'};
    else if(body.method==='ping') result={};
    else if(body.method==='tools/list') result={tools};
    else if(body.method==='tools/call') {
      const name=String(body.params?.name),args=(body.params?.arguments||{}) as Record<string,unknown>;
      let output:unknown;
      if(name==='search_works') output=await searchWorks(String(args.query||'').slice(0,200),String(args.kind||''));
      else if(name==='get_work') output=await read('registry','get_work',[z.string().regex(/^[a-f0-9]{64}$/).parse(args.work_id)]);
      else if(name==='inspect_artifact') output=await inspectArtifact(z.string().parse(args.url));
      else if(name==='submit_action') output=await submit(subject,actionSchema.parse(args.action),z.string().parse(args.idempotency_key));
      else if(name==='operation_status') output=await refreshOperation(subject,z.string().uuid().parse(args.operation_id));
      else if(name==='read_docket') output=await read('court','get_claim',[z.string().regex(/^[a-f0-9]{64}$/).parse(args.claim_id)]);
      else throw new AppError('Unknown tool.',404);
      result={content:[{type:'text',text:JSON.stringify(output)}],structuredContent:output,isError:false};
    } else return NextResponse.json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
    return NextResponse.json({jsonrpc:'2.0',id,result},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const response=failure(error);
    if(response.status===401) return response;
    const {error:message}=await response.json();
    return NextResponse.json({jsonrpc:'2.0',id,error:{code:-32602,message}});
  }
}
export function GET(){return new NextResponse(null,{status:405,headers:{Allow:'POST'}});}
