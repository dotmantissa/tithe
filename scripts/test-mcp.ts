import '../src/lib/network';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {database} from '../src/lib/db';
import {digest} from '../src/lib/security';
import {accountFor} from '../src/lib/chain';
const subject='tithe:mcp:live:'+randomUUID(),token='tithe_'+randomBytes(32).toString('hex'),id=randomUUID(),sql=database();
await sql`INSERT INTO tithe_keys(id,subject,name,digest,prefix) VALUES(${id},${subject},'Temporary MCP verification',${digest(token)},${token.slice(0,14)})`;
const client=new Client({name:'Tithe live verification',version:'1.0.0'}),endpoint=new URL('/api/mcp',process.env.TEST_APP_URL||'http://localhost:3000');
try{
 await client.connect(new StreamableHTTPClientTransport(endpoint,{requestInit:{headers:{Authorization:'Bearer '+token}}}));
 const list=await client.listTools();assert.equal(list.tools.length,12);assert.ok(list.tools.some(t=>t.name==='get_licence'));assert.ok(list.tools.some(t=>t.name==='resume_operation'));
 const account=await client.callTool({name:'get_account',arguments:{}});assert.equal(account.isError,false);assert.equal((account.structuredContent as {address:string}).address,accountFor(subject).address);
 const search=await client.callTool({name:'search_works',arguments:{query:''}});assert.equal(search.isError,false);assert.ok(Array.isArray((search.structuredContent as {works:unknown[]}).works));
 const unsafe=await client.callTool({name:'inspect_artifact',arguments:{url:'https://127.0.0.1/private'}});assert.equal(unsafe.isError,true);
 const invalid=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','mcp-protocol-version':'1999-01-01'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal(invalid.status,400);
 console.log('Official MCP client live checks passed: negotiation, discovery, real account/search readers, tool errors and protocol version enforcement.');
}finally{await client.close();await sql`DELETE FROM tithe_keys WHERE subject=${subject}`;await sql`DELETE FROM tithe_limits WHERE scope LIKE ${subject+'%'}`;}
