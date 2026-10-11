import '../src/lib/network';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { database } from '../src/lib/db';
import { digest } from '../src/lib/security';
import { accountFor } from '../src/lib/chain';

const base=process.env.TEST_APP_URL||'http://localhost:3000';
async function request(url:string,options:RequestInit={}){
  for(let attempt=0;;attempt++){
    const response=await fetch(url,options);
    if(response.status!==503||attempt>=3)return response;
    await response.body?.cancel();
    console.log('Waiting for a real dependency to reconnect');
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
}
const subject='tithe:api:integration:'+randomUUID();
const token='tithe_'+randomBytes(32).toString('hex'),id=randomUUID();
const sql=database();
await sql`INSERT INTO tithe_keys(id,subject,name,digest,prefix) VALUES(${id},${subject},'Ephemeral API verification',${digest(token)},${token.slice(0,14)})`;
const auth={Authorization:'Bearer '+token,'Content-Type':'application/json'};
try{
  let response=await request(base+'/api/maintenance');assert.equal(response.status,401);
  if(process.env.CRON_SECRET){response=await request(base+'/api/maintenance',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET}});assert.equal(response.status,200);assert.equal((await response.json()).indexed,true);}
  response=await request(base+'/api/account');assert.equal(response.status,401);
  response=await request(base+'/api/account',{headers:auth});assert.equal(response.status,200);
  const account=await response.json();assert.equal(account.address,accountFor(subject).address);
  response=await request(base+'/api/operations/'+randomUUID(),{headers:auth});assert.equal(response.status,404);
  response=await request(base+'/api/artifacts',{method:'POST',headers:auth,body:JSON.stringify({url:'https://127.0.0.1/work.txt'})});assert.equal(response.status,400);
  response=await request(base+'/api/artifacts',{method:'POST',headers:auth,body:JSON.stringify({url:'https://raw.githubusercontent.com/genlayerlabs/genlayer-studio/main/examples/contracts/llm_erc20.py'})});
  if(response.status!==200)console.log('Artifact fetch result:',await response.clone().json());
  assert.equal(response.status,200);
  const artifact=await response.json();assert.match(artifact.content_hash,/^[a-f0-9]{64}$/);assert.equal(artifact.kind,'text');assert.ok(artifact.bytes>100);
  response=await request(base+'/api/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'Tithe verification',version:'1'}}})});assert.equal(response.status,200);assert.equal((await response.json()).result.serverInfo.name,'Tithe');
  response=await request(base+'/api/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})});assert.equal(response.status,200);assert.equal((await response.json()).result.tools.length,6);
  response=await request(base+'/api/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'search_works',arguments:{query:''}}})});assert.equal(response.status,200);assert.equal((await response.json()).result.isError,false);
  response=await request(base+'/api/keys',{method:'POST',headers:auth,body:JSON.stringify({name:'Agent cannot mint keys'})});assert.equal(response.status,401);
  response=await request(base+'/api/actions',{method:'POST',headers:{...auth,Origin:'https://untrusted.example'},body:JSON.stringify({kind:'withdraw',contract:'desk'})});assert.equal(response.status,403);
  await sql`UPDATE tithe_keys SET revoked_at=now() WHERE id=${id}`;
  response=await request(base+'/api/account',{headers:auth});assert.equal(response.status,401);
  console.log('Live API checks passed: account authorization, safe fetch, real fingerprint, MCP tools, origin checks and key revocation.');
}finally{
  await sql`DELETE FROM tithe_keys WHERE subject=${subject}`;
  await sql`DELETE FROM tithe_limits WHERE scope LIKE ${subject+'%'}`;
}
