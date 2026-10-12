'use client';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { AlertCircle, Check, LoaderCircle, LockKeyhole, RefreshCw, Copy, FileText, ImageIcon, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { formatUnits, parseUnits } from 'viem';
import type { Operation, Work } from '@/lib/types';

export function amount(value:string='0') { try {
  const [whole,fraction]=formatUnits(BigInt(value),18).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction?'.'+fraction:'');
} catch { return '0'; } }
export function atto(value:string) { if(!/^\d+(\.\d{1,18})?$/.test(value)) throw new Error('Enter a price with up to 18 decimal places.'); return parseUnits(value,18).toString(); }
export function short(value:string) { return value.slice(0,8)+'…'+value.slice(-6); }
export function date(value:number) { return new Date(value*1000).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}); }

export function useApi() {
  const {getAccessToken,authenticated}=usePrivy();
  return useCallback(async <T,>(path:string,options:RequestInit={}):Promise<T>=>{
    const token=authenticated?await getAccessToken():null;
    const response=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});
    const body=await response.json();
    if(!response.ok) throw new Error(body.error||'Something interrupted that request. Please try again.');
    return body as T;
  },[getAccessToken,authenticated]);
}
export function useResource<T>(path:string|null,privateResource=false,pollMs=0) {
  const api=useApi(),{authenticated,ready}=usePrivy();
  const [state,setState]=useState<{data:T|null;error:string;loading:boolean}>({data:null,error:'',loading:true});
  const canLoad=!privateResource||(ready&&authenticated);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{if(!pollMs||!canLoad)return;const timer=setInterval(()=>setRevision(v=>v+1),pollMs);return()=>clearInterval(timer);},[pollMs,canLoad]);
  const reload=useCallback(()=>setRevision(v=>v+1),[]);
  useEffect(()=>{
    if(!path||!canLoad) return;
    let active=true;
    async function load(){
      setState(s=>({...s,loading:s.data===null,error:''}));
      try { const data=await api<T>(path!);if(active)setState({data,error:'',loading:false}); }
      catch(error){if(active)setState(s=>({...s,error:error instanceof Error?error.message:'Could not load this page.',loading:false}));}
    }
    void load();return()=>{active=false;};
  },[path,api,revision,canLoad]);
  return {...state,reload};
}
const terminal=(status:string)=>['FINALIZED','FAILED','CANCELED','ABORTED'].includes(status);
export function useAction(onComplete?:()=>void){
 const api=useApi(),{user,authenticated}=usePrivy(),pathname=usePathname();
 const storage=user?.id?'tithe:operation:v2:'+user.id+':'+pathname:null;
 const [operation,setOperation]=useState<Operation|null>(null),[error,setError]=useState(''),[submitting,setSubmitting]=useState(false);
 const request=useRef<{body:string;key:string}|null>(null),complete=useRef(onComplete),notified=useRef('');
 useEffect(()=>{complete.current=onComplete;},[onComplete]);
 useEffect(()=>{
  if(!storage||!authenticated)return;let active=true;
  const stored=localStorage.getItem(storage);if(!stored)return;
  try{const saved=JSON.parse(stored) as {id?:string;key:string};
   void api<Operation>(saved.id?'operations/'+saved.id:'operations/find?key='+encodeURIComponent(saved.key)).then(op=>{if(active)setOperation(op);}).catch(()=>{if(active)setError('Your saved request is on your desk. Refresh its activity record to check the latest status.');});
  }catch{localStorage.removeItem(storage);}
  return()=>{active=false;};
 },[storage,authenticated,api]);
 const act=async(action:unknown)=>{
  if(operation&&!terminal(operation.status))return;
  setError('');setSubmitting(true);const body=JSON.stringify(action);
  if(!request.current||request.current.body!==body||operation&&terminal(operation.status))request.current={body,key:crypto.randomUUID()};
  if(storage)localStorage.setItem(storage,JSON.stringify({key:request.current.key}));
  try{const op=await api<Operation>('actions',{method:'POST',body,headers:{'Idempotency-Key':request.current.key}});if(storage)localStorage.setItem(storage,JSON.stringify({id:op.id,key:request.current.key}));setOperation(op);}
  catch(e){setError(e instanceof Error?e.message:'The request could not be sent.');}
  finally{setSubmitting(false);}
 };
 useEffect(()=>{
  if(!operation)return;
  if(['ACCEPTED','FINALIZED','FAILED','CANCELED','ACCEPTED_REJECTED'].includes(operation.status)&&notified.current!==operation.id+':'+operation.status){notified.current=operation.id+':'+operation.status;complete.current?.();}
  if(terminal(operation.status)){if(storage)localStorage.removeItem(storage);request.current=null;return;}
  let active=true,timer:ReturnType<typeof setTimeout>;
  async function poll(){
   try{
    const recovering=['SIGNED','SUBMISSION_UNCERTAIN','RECOVERING'].includes(operation!.status);
    const next=await api<Operation>('operations/'+operation!.id+(recovering?'/resume':''),recovering?{method:'POST',body:'{}'}:{});
    if(active){setError('');setOperation(next);}
   }catch(e){if(active){setError(e instanceof Error?e.message:'Status is temporarily unavailable.');timer=setTimeout(poll,30000);}}
  }
  timer=setTimeout(poll,operation.status==='ACCEPTED'?15000:12000);return()=>{active=false;clearTimeout(timer);};
 },[operation,api,storage]);
 return {act,operation,error,busy:submitting||Boolean(operation&&!terminal(operation.status))};
}
export function Notice({error,children}:{error?:boolean;children:React.ReactNode}) { return <div className={error?'notice error':'notice'} role={error?'alert':'status'}>{error?<AlertCircle size={18}/>:<Check size={18}/>}<div>{children}</div></div>; }
export function Loading({text='Fetching the latest records…'}:{text?:string}) { return <div className="loading-state" role="status"><LoaderCircle size={24} className="spinner"/><span>{text}</span></div>; }
export function LoadError({message,retry}:{message:string;retry:()=>void}) { return <div className="empty-state"><AlertCircle size={30}/><h3>A small interruption.</h3><p>{message}</p><button className="button secondary" onClick={retry}><RefreshCw size={16}/>Try again</button></div>; }
export function AuthGate({children}:{children:React.ReactNode}) {
  const {ready,authenticated,login}=usePrivy();
  if(!ready)return <Loading text="Getting your desk ready…"/>;
  if(!authenticated)return <div className="auth-gate"><LockKeyhole size={32}/><h2>Your email is all you need.</h2><p>No wallet juggling. Sign in and we will handle the paperwork.</p><button className="button" onClick={login}>Continue with email</button><small>Fees and bonds use Studio test funds.</small></div>;
  return <>{children}</>;
}
export function OperationNotice({operation,error,busy}:{operation:Operation|null;error:string;busy:boolean}) {
  return <>{error&&<Notice error>{error}</Notice>}{operation&&<div className="operation-status" role="status">
    {busy?<LoaderCircle className="spinner" size={18}/>:['FAILED','ABORTED','ACCEPTED_REJECTED','UNDETERMINED','SUBMISSION_UNCERTAIN','CANCELED'].includes(operation.status)?<AlertCircle size={18}/>:<Check size={18}/>}
    <div><strong>{operation.status==='SUBMISSION_UNCERTAIN'?'Your signed request is saved.':operation.status==='UNDETERMINED'?'The panel has not reached agreement.':operation.status==='ACCEPTED'?'Recorded, awaiting final confirmation.':operation.status==='ACCEPTED_REJECTED'?'The current result rejected this request.':busy?'Your request is with the panel.':['FAILED','ABORTED'].includes(operation.status)?'The request did not complete.':operation.status==='SUBMISSION_UNCERTAIN'?'We are checking this submission.':operation.status==='CANCELED'?'This request was canceled.':'Your request has been recorded.'}</strong><p>{operation.error|| (busy?'You can leave this page. We will resume checking when you return.':'Open your desk to see the result and its explanation.')}</p><Link href="/account">View my desk</Link></div>
  </div>}</>;
}
export function CopyButton({value,label='Copy'}:{value:string;label?:string}) {
  const [copied,setCopied]=useState(false),[error,setError]=useState(false);
  return <button className="copy-button" onClick={async()=>{try{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),2500);}catch{setError(true);}}} aria-label={label}>{copied?<Check size={15}/>:<Copy size={15}/>}<span>{error?'Select and copy':copied?'Copied':label}</span></button>;
}
export function WorkRow({work}:{work:Work}) {
  const price=work.terms.price_schedule_atto[work.terms.licence_class];
  return <Link href={'/work/'+work.work_id} className="work-row">
    <span className={'work-icon '+work.kind}>{work.kind==='image'?<ImageIcon size={24} strokeWidth={1.5}/>:<FileText size={24} strokeWidth={1.5}/>}</span>
    <div className="work-row-info"><h3>{work.title}</h3><p>{new URL(work.url).hostname}<span className="slash">/</span>{work.kind==='text'?'Written work':'Still image'}</p></div>
    <div className="work-row-terms"><span>{work.terms.licence_class==='commercial'?'Commercial licence':work.terms.licence_class==='research'?'Research licence':work.terms.licence_class==='quote'?'Quotation licence':'Derivative licence'}</span><small>Terms version {work.version}</small></div>
    <div className="work-row-price"><strong>{price==='0'?'No fee':amount(price)+' GEN'}</strong><small>Studio funds</small></div><ExternalLink size={17} className="row-open"/>
  </Link>;
}

export function useClock(){
 const clock=useResource<{unix_seconds:number}>('clock',false,60000),[time,setTime]=useState(()=>Math.floor(Date.now()/1000)),baseline=useRef<{network:number;local:number}|null>(null);
 useEffect(()=>{if(clock.data)baseline.current={network:clock.data.unix_seconds,local:Date.now()};},[clock.data]);
 useEffect(()=>{const timer=setInterval(()=>{const b=baseline.current;setTime(b?b.network+Math.floor((Date.now()-b.local)/1000):Math.floor(Date.now()/1000));},1000);return()=>clearInterval(timer);},[]);
 return time;
}

export function TermsAtUse({workId,used,version,onVersion}:{workId:string;used:string;version:number;onVersion:(value:number)=>void}){
 const epoch=Math.floor(new Date(used).getTime()/1000);
 const terms=useResource<{versions:{version:number;terms:{clauses:string[]}}[]}>(Number.isFinite(epoch)&&epoch>0?'works/'+workId+'/terms-at?used_at='+epoch:null);
 useEffect(()=>{if(terms.data?.versions.length===1)onVersion(terms.data.versions[0].version);},[terms.data,onVersion]);
 if(!used)return null;
 if(terms.error)return <Notice error>{terms.error}</Notice>;
 if(terms.loading)return <Loading text="Finding the terms at that time…"/>;
 const candidates=terms.data?.versions||[],selected=candidates.find(t=>t.version===version);
 return <><label className="field"><span>Terms version at this time</span><select value={selected?version:0} onChange={e=>onVersion(Number(e.target.value))} required><option value={0} disabled>Choose the version both parties will assess</option>{candidates.map(t=><option value={t.version} key={t.version}>Version {t.version}</option>)}</select><small>{candidates.length>1?'More than one version shares this timestamp. Read each version before choosing.':'The other party must explicitly agree to this time and version.'}</small></label>{selected&&<div className="terms-preview">{selected.terms.clauses.map(c=><p key={c}>{c}</p>)}</div>}</>;
}
