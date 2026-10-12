'use client';
import { useState } from 'react';
import { Terminal, KeyRound, Trash2 } from 'lucide-react';
import { AuthGate, useApi, useResource, CopyButton, Notice, Loading, LoadError, date } from '@/components/ui';
const requestExample=`curl "$TITHE_URL/api/actions" \
  -H "Authorization: Bearer $TITHE_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: a-unique-key-for-this-request" \
  -d '{
    "kind": "licence",
    "work_id": "YOUR_REGISTERED_WORK_ID",
    "intended_use_text": "Quote a short passage with attribution in our research report.",
    "use_class": "quote",
    "expected_terms_version": 1,
    "expected_fee_atto": "0"
  }'`;
const mcpExample=`{
  "mcpServers": {
    "tithe": {
      "url": "${process.env.NEXT_PUBLIC_APP_URL||'http://localhost:3000'}/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TITHE_API_KEY"
      }
    }
  }
}`;
export default function DevelopersPage(){
  return <><div className="page-head wrap"><h1>Teach your agent<br/>to ask first.</h1><p>Permission should fit into the task. One API, one public record, and considerably less awkwardness.</p></div><section className="page-body wrap docs-layout"><nav className="docs-nav" aria-label="Developer guide"><a href="#keys">Your API keys</a><a href="#api">Request a licence</a><a href="#mcp">Connect an agent</a><a href="#records">Read the result</a></nav><div className="prose">
    <section id="keys"><KeyRound size={29}/><h2>A key to your desk.</h2><p>API keys act as your signed in account. They can register work, request licences, post bonds and withdraw available credits. Give each agent its own key, and revoke it when the job is done.</p><AuthGate><Keys/></AuthGate></section>
    <section id="api"><h2>Ask for permission mid task.</h2><p>Search <code>/api/works?q=your+topic</code>, then read <code>/api/works/WORK_ID</code>. The registered terms and price schedule tell your agent what is available. Have the person running it approve the fee before submitting.</p><div className="code-wrap"><CopyButton value={requestExample} label="Copy request"/><pre>{requestExample}</pre></div><p>The server reads the current price and deposits that exact amount from your Studio account. Send the exact terms version and fee you approved. A changed price or version refuses submission. Use the same request key if you retry the same action. Changing the action requires a new key.</p></section>
    <section id="mcp"><Terminal size={29}/><h2>Make asking part of the conversation.</h2><p>The MCP server uses Streamable HTTP at <code>/api/mcp</code>. Add its URL and your API key to a client that supports an authenticated HTTP server.</p><div className="code-wrap"><CopyButton value={mcpExample} label="Copy configuration"/><pre>{mcpExample}</pre></div><p>Available tools: <code>search_works</code>, <code>get_work</code>, <code>get_licence</code>, <code>get_terms</code>, <code>terms_at_use</code>, <code>get_account</code>, <code>inspect_artifact</code>, <code>submit_action</code>, <code>operation_status</code>, <code>resume_operation</code> and <code>read_docket</code>. The action tool publishes its full input schema, including fees and bond actions.</p></section>
    <section id="records"><h2>The receipt is the result.</h2><p>A submitted action returns an operation ID. Poll <code>/api/operations/OPERATION_ID</code> with your key through final confirmation. Accepted results are provisional. The response includes <code>result.record_id</code>: use it with <code>get_licence</code> or <code>read_docket</code> to read the actual decision. If a broadcast is uncertain, call <code>resume_operation</code> or POST to <code>/api/operations/OPERATION_ID/resume</code>. Recovery reuses the original signed request, so it cannot create a second payment.</p><p>An approval covers the described use and terms version. A refusal includes the relevant clause and an explanation, and credits the deposited fee back. Neither is a substitute for legal advice or a guarantee of legal safe harbour.</p><p>The app runs on GenLayer Studio. Funds here are test funds. Your agent should never describe them as a real cash payment.</p></section>
  </div></section></>;
}
type ApiKey={id:string;name:string;prefix:string;created_at:string};
function Keys(){
  const api=useApi(),resource=useResource<{keys:ApiKey[]}>('keys',true),[name,setName]=useState(''),[token,setToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div><form className="key-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const key=await api<{token:string}>('keys',{method:'POST',body:JSON.stringify({name})});setToken(key.token);setName('');resource.reload();}catch(e){setError(e instanceof Error?e.message:'Could not create the key.');}finally{setBusy(false);}}}><label className="field"><span>A name you will remember</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={80} placeholder="My research assistant" required/></label><button className="button" disabled={busy}>{busy?'Making a key…':'Create API key'}</button></form>{error&&<Notice error>{error}</Notice>}{token&&<div className="key-token"><strong>Copy it now. We only show it once.</strong><code>{token}</code><CopyButton value={token} label="Copy API key"/><p>Store this in your agent&apos;s secret manager. Anyone with it can act as your account.</p><button className="text-button" style={{marginTop:14}} onClick={()=>setToken('')}>I have saved it</button></div>}{resource.loading?<Loading text="Reading your keys…"/>:resource.error?<LoadError message={resource.error} retry={resource.reload}/>:resource.data?.keys.map(key=><div className="record-row" key={key.id}><div><h3>{key.name}</h3><p>{key.prefix}… · Created {date(new Date(key.created_at).getTime()/1000)}</p></div><button className="icon-button" aria-label={'Revoke '+key.name} disabled={busy} onClick={async()=>{if(!window.confirm('Revoke this key? Any agent using it will lose access.'))return;setBusy(true);try{await api('keys/'+key.id,{method:'DELETE'});resource.reload();}catch(e){setError(e instanceof Error?e.message:'Could not revoke the key.');}finally{setBusy(false);}}}><Trash2 size={17}/></button></div>)}</div>;
}
