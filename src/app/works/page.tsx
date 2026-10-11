'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search, FileText, ImageIcon, Layers3, Plus } from 'lucide-react';
import { useResource, Loading, LoadError, WorkRow } from '@/components/ui';
import type { Work } from '@/lib/types';
export default function WorksPage() {
  const [input,setInput]=useState(''),[query,setQuery]=useState(''),[kind,setKind]=useState(''),[offset,setOffset]=useState(0);
  const resource=useResource<{works:Work[];has_more:boolean}>('works?'+new URLSearchParams({q:query,kind,offset:String(offset)}));
  return <><div className="page-head wrap"><div className="page-head-row"><div><h1>The register.</h1><p>Good work deserves clear terms. Find something worth asking for.</p></div><Link href="/register" className="button"><Plus size={17}/>Add your work</Link></div></div>
    <section className="page-body wrap library-layout"><aside className="filters"><h2>A little narrowing down</h2>{[['','All work',Layers3],['text','Written work',FileText],['image','Still images',ImageIcon]].map(([value,label,Icon])=>{const Component=Icon as typeof Layers3;return <button key={String(value)} className={'filter-button '+(kind===value?'active':'')} aria-pressed={kind===value} onClick={()=>{setKind(String(value));setOffset(0);}}><span>{String(label)}</span><Component size={16}/></button>;})}<p>Every entry is registered on GenLayer. Read the creator&apos;s terms before requesting permission.</p></aside>
    <div><form className="search-box" onSubmit={e=>{e.preventDefault();setQuery(input);setOffset(0);}}><Search size={21}/><input aria-label="Search works and licence terms" value={input} onChange={e=>setInput(e.target.value)} placeholder="A title, a topic, a permission…" maxLength={200}/><button className="button compact" type="submit">Search</button></form>
      {resource.loading?<Loading/>:resource.error?<LoadError message={resource.error} retry={resource.reload}/>:resource.data?.works.length?<><div className="work-list">{resource.data.works.map(work=><WorkRow key={work.work_id} work={work}/>)}</div><div className="pagination"><button className="button secondary compact" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-20))}>Previous</button><span>Page {Math.floor(offset/20)+1}</span><button className="button secondary compact" disabled={!resource.data.has_more} onClick={()=>setOffset(offset+20)}>Next</button></div></>:<div className="empty-state"><Search size={31}/><h3>{query?'Nothing here just yet.':'There is room for your work.'}</h3><p>{query?'Try a different title or a broader topic. Permission can be hiding in plain sight.':'The register only shows real work. Put yours on record and let people ask properly.'}</p><Link className="button secondary" href="/register">Register a work</Link></div>}
    </div></section></>;
}
