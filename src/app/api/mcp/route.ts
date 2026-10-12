import {NextResponse} from 'next/server';
import {z} from 'zod';
import {authenticate,checkOrigin,limit,readJSON} from '@/lib/security';
import {failure} from '@/lib/errors';
import {searchWorks,getAccount} from '@/lib/api';
import {inspectArtifact} from '@/lib/artifacts';
import {read} from '@/lib/chain';
import {submit,refreshOperation,resumeOperation,cancelOperation} from '@/lib/operations';
import {actionSchema} from '@/lib/schemas';
export const runtime='nodejs';export const maxDuration=300;export const dynamic='force-dynamic';
const version='2025-06-18',record=z.string().regex(/^[a-f0-9]{64}$/),operation=z.string().uuid();
const schemas={
 search_works:z.strictObject({query:z.string().max(200).default(''),kind:z.enum(['text','image','']).default(''),offset:z.number().int().min(0).max(10000000).default(0)}),
 get_work:z.strictObject({work_id:record}),get_licence:z.strictObject({licence_id:record}),read_docket:z.strictObject({claim_id:record}),
 get_terms:z.strictObject({work_id:record,version:z.number().int().min(1).max(128)}),
 terms_at_use:z.strictObject({work_id:record,used_at:z.number().int().positive()}),
 get_account:z.strictObject({works_offset:z.number().int().min(0).default(0),licences_offset:z.number().int().min(0).default(0),claims_offset:z.number().int().min(0).default(0),operations_offset:z.number().int().min(0).default(0)}),
 inspect_artifact:z.strictObject({url:z.string().max(2048)}),
 submit_action:z.strictObject({action:actionSchema,idempotency_key:z.string().min(16).max(100)}),
 operation_status:z.strictObject({operation_id:operation}),resume_operation:z.strictObject({operation_id:operation}),cancel_operation:z.strictObject({operation_id:operation}),
};
const descriptions:Record<keyof typeof schemas,string>={search_works:'Search public works with paginated results.',get_work:'Read the registered work and current terms from GenLayer.',get_licence:'Read the resulting licence, approved use, terms version and escrow status.',read_docket:'Read the public claim, agreed time, prior licence, ruling and review history.',get_terms:'Read a specific immutable terms version.',terms_at_use:'Read all historical version candidates at the proposed time; parties must agree explicitly.',get_account:'Read your managed address, native balance, withdrawable credits and independently paginated records.',inspect_artifact:'Fetch public text, PNG or WebP and fingerprint the actual bytes.',submit_action:'Submit a consented action. Paid actions require the exact published fee or bond and terms or review round. Returns a durable operation ID; poll until final, then retrieve result.record_id.',operation_status:'Read execution and consensus status plus the resulting record ID. Accepted results are provisional; continue until FINALIZED or FAILED.',cancel_operation:'Cancel your own stalled zero-value action before it is recorded. Funding transfers remain protected and cannot be canceled through this tool.',resume_operation:'Recover a saved uncertain submission using the identical signed bytes. Never creates a replacement payment.'};
const tools=Object.entries(schemas).map(([name,schema])=>({name,description:descriptions[name as keyof typeof schemas],inputSchema:z.toJSONSchema(schema)}));
const reply=(id:unknown,result:unknown)=>NextResponse.json({jsonrpc:'2.0',id,result},{headers:{'Cache-Control':'no-store'}});
const protocolError=(id:unknown,code:number,message:string,status=200)=>NextResponse.json({jsonrpc:'2.0',id,error:{code,message}},{status});
export async function POST(request:Request){
 let id:unknown=null;
 try{
  checkOrigin(request);const subject=await authenticate(request);await limit(subject+':mcp',30);
  const header=request.headers.get('mcp-protocol-version');
  if(header&&header!==version)return protocolError(null,-32600,'Unsupported MCP protocol version.',400);
  let input;try{input=await readJSON(request);}catch{return protocolError(null,-32700,'Parse error.',400);}
  const parsed=z.strictObject({jsonrpc:z.literal('2.0'),id:z.union([z.string(),z.number().int()]).optional(),method:z.string(),params:z.record(z.string(),z.unknown()).optional()}).safeParse(input);
  if(!parsed.success)return protocolError(null,-32600,'Invalid request.',400);
  const body=parsed.data;id=body.id??null;
  if(body.id===undefined){if(!body.method.startsWith('notifications/'))return protocolError(null,-32600,'Requests need an ID.',400);return new NextResponse(null,{status:202});}
  if(body.method==='initialize'){
   const init=z.object({protocolVersion:z.string(),capabilities:z.record(z.string(),z.unknown()),clientInfo:z.object({name:z.string(),version:z.string()})}).safeParse(body.params);
   if(!init.success)return protocolError(id,-32602,'Invalid initialize parameters.');
   // MCP negotiation returns our supported version; subsequent requests bind it.
   return reply(id,{protocolVersion:version,capabilities:{tools:{listChanged:false}},serverInfo:{name:'Tithe',version:'2.0.0'},instructions:'Private licensing and arbitration on GenLayer Studio, using test funds. Obtain consent before payments. Terms and evidence are public. A licence covers its approved intended use. Poll operation results through finality.'});
  }
  if(body.method==='ping')return reply(id,{});
  if(body.method==='tools/list')return reply(id,{tools});
  if(body.method!=='tools/call')return protocolError(id,-32601,'Method not found.');
  const call=z.strictObject({name:z.string(),arguments:z.record(z.string(),z.unknown()).optional(),_meta:z.record(z.string(),z.unknown()).optional()}).safeParse(body.params);
  if(!call.success)return protocolError(id,-32602,'Invalid tool call parameters.');
  const name=call.data.name as keyof typeof schemas;
  if(!(name in schemas))return protocolError(id,-32602,'Unknown tool.');
  try{
   const args=schemas[name].parse(call.data.arguments||{}) as Record<string,unknown>;let output:unknown;
   if(name==='search_works')output=await searchWorks(String(args.query),String(args.kind),Number(args.offset));
   else if(name==='get_work')output=await read('registry','get_work',[String(args.work_id)]);
   else if(name==='get_licence')output=await read('desk','get_licence',[String(args.licence_id)]);
   else if(name==='read_docket')output=await read('court','get_claim',[String(args.claim_id)]);
   else if(name==='get_terms')output=await read('registry','get_terms',[String(args.work_id),Number(args.version)]);
   else if(name==='terms_at_use')output=await read('registry','get_terms_versions_at',[String(args.work_id),Number(args.used_at)]);
   else if(name==='get_account'){const url=new URL('https://tithe.invalid/api/account');for(const [key,value] of Object.entries(args))url.searchParams.set(key,String(value));output=await getAccount(subject,url);}
   else if(name==='inspect_artifact')output=await inspectArtifact(String(args.url));
   else if(name==='submit_action')output=await submit(subject,actionSchema.parse(args.action),String(args.idempotency_key));
   else if(name==='cancel_operation')output=await cancelOperation(subject,String(args.operation_id));
   else if(name==='resume_operation')output=await resumeOperation(subject,String(args.operation_id));
   else output=await refreshOperation(subject,String(args.operation_id));
   // structuredContent must be an object, including when a tool returns an array.
   return reply(id,{content:[{type:'text',text:JSON.stringify(output)}],structuredContent:Array.isArray(output)?{items:output}:output,isError:false});
  }catch(error){const response=failure(error),body=await response.json();return reply(id,{content:[{type:'text',text:body.error}],isError:true});}
 }catch(error){return failure(error);}
}
export function GET(){return new NextResponse(null,{status:405,headers:{Allow:'POST'}});}
export function DELETE(){return new NextResponse(null,{status:405,headers:{Allow:'POST'}});}
