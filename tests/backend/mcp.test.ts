import {beforeEach,it,expect,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const m=vi.hoisted(()=>({read:vi.fn(),submit:vi.fn(),refresh:vi.fn(),account:vi.fn()}));
vi.mock('@/lib/security',()=>({authenticate:async()=> 'owner',checkOrigin:()=>{},limit:async()=>{},readJSON:async(r:Request)=>r.json()}));
vi.mock('@/lib/api',()=>({searchWorks:async()=>({works:[]}),getAccount:m.account}));
vi.mock('@/lib/chain',()=>({read:m.read}));
vi.mock('@/lib/operations',()=>({submit:m.submit,refreshOperation:m.refresh,resumeOperation:m.refresh,cancelOperation:m.refresh}));
import {POST,GET} from '../../src/app/api/mcp/route';
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue({licence_id:'b'.repeat(64),decision:'APPROVE',terms_version:1});m.submit.mockResolvedValue({id:'12345678-1234-4234-8234-123456789012',status:'PENDING'});m.refresh.mockResolvedValue({status:'FINALIZED',result:{record_id:'b'.repeat(64),contract:'desk',method:'request_licence'}});m.account.mockResolvedValue({balance_atto:'100',credit_atto:'0',works:[],licences:[]});});
it('supports an actual official MCP client from initialization through licence result retrieval',async()=>{
 const client=new Client({name:'Tithe integration client',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(new URL('https://tithe.example/api/mcp'),{fetch:async(input,init)=>{const req=new Request(input,init);return req.method==='POST'?POST(req):GET();}});
 await client.connect(transport);
 const listed=await client.listTools();expect(listed.tools.map(t=>t.name)).toContain('get_licence');expect(listed.tools.map(t=>t.name)).toContain('get_account');
 const op=await client.callTool({name:'submit_action',arguments:{action:{kind:'licence',work_id:'a'.repeat(64),use_class:'commercial',intended_use_text:'Quote the passage with attribution.',expected_terms_version:1,expected_fee_atto:'100'},idempotency_key:'official-client-request-123'}});
 expect(op.isError).toBe(false);
 const status=await client.callTool({name:'operation_status',arguments:{operation_id:'12345678-1234-4234-8234-123456789012'}});
 const result=status.structuredContent as {result:{record_id:string}};
 const licence=await client.callTool({name:'get_licence',arguments:{licence_id:result.result.record_id}});expect(licence.structuredContent).toMatchObject({decision:'APPROVE'});
 await client.close();
});
it('encodes business and validation failures as tool errors understood by clients',async()=>{
 m.read.mockRejectedValue(new Error('private database credential'));
 const response=await POST(new Request('https://tithe.example/api/mcp',{method:'POST',headers:{'mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_licence',arguments:{licence_id:'b'.repeat(64)}}})}));
 const body=await response.json();expect(body.result.isError).toBe(true);expect(body.error).toBeUndefined();expect(JSON.stringify(body)).not.toContain('credential');
});
it('refuses an unsupported protocol header before performing a tool',async()=>{
 const response=await POST(new Request('https://tithe.example/api/mcp',{method:'POST',headers:{'mcp-protocol-version':'1999-01-01'},body:'{}'}));expect(response.status).toBe(400);expect(m.read).not.toHaveBeenCalled();
});
it('keeps protocol errors distinct from tool execution failures',async()=>{
 const response=await POST(new Request('https://tithe.example/api/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'invented',arguments:{}}})}));expect((await response.json()).error.code).toBe(-32602);
});
