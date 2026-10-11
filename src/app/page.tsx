'use client';
import Link from 'next/link';
import { Fingerprint, FileCheck2, Scale, Plus, Check, Asterisk, BookOpen, FileText } from 'lucide-react';
import { useResource, WorkRow, Loading, LoadError } from '@/components/ui';
import type { Work } from '@/lib/types';
export default function Home() {
  const stats=useResource<{works:number;licences:number;claims:number;escrow_atto:string}>('stats');
  const register=useResource<{works:Work[]}>('works');
  return <>
    <section className="hero wrap">
      <div className="hero-copy"><div className="hero-intro"><span className="tiny-seal"><Asterisk size={17}/></span>A little permission goes a long way.</div>
        <h1>Your work.<br/>Your terms.<br/><span className="share-word">Your share.</span></h1>
        <p className="hero-description">You made something worth using.<br/>You should have a say in how it is used.<br/>And a share when it is.</p>
        <div className="hero-actions"><Link href="/register" className="button"><Plus size={18}/>Put your work on record</Link><Link href="/works" className="plain-link">Find work you can use</Link></div>
        <p className="hero-footnote"><Check size={15}/>Plain English terms. Email sign in. Yours from the start.</p>
      </div>
      <div className="hero-rail">
        <div className="receipt" aria-label="Tithe live register summary">
          <div className="receipt-head"><Fingerprint size={40} strokeWidth={1.2}/><span className="mono">A fair share<br/>starts here.</span></div>
          <div className="receipt-title">Permission,<br/>with a paper trail.</div>
          <div className="receipt-line"/>
          <dl className="receipt-facts"><div><dt>The work</dt><dd>Stays yours</dd></div><div><dt>The terms</dt><dd>In your words</dd></div><div><dt>The permission</dt><dd>On record</dd></div><div><dt>The disagreement</dt><dd>A fair hearing</dd></div></dl>
          <div className="receipt-perforation"/>
          <div className="receipt-total"><span>Works on the register</span><strong>{stats.data?stats.data.works.toLocaleString():'…'}</strong></div>
          <div className="receipt-bottom"><span>GenLayer Studio</span><FileCheck2 size={25} strokeWidth={1.2}/></div>
        </div>
        <div className="receipt-caption"><span className="caption-stroke"/>Good fences. Better neighbours.</div>
      </div>
    </section>
    <section className="principle-strip"><div className="wrap"><span>A tithe is a portion returned<br/>to the source of the yield.</span><p>The idea is old.<br/>{' '}The way we make it happen is new.</p><span className="portion-diagram" aria-label="One of ten portions returned">{Array.from({length:10},(_,i)=><i key={i}/>)}</span></div></section>
    <section className="register-section wrap">
      <aside className="section-rail"><BookOpen size={26} strokeWidth={1.4}/><h2>Made by people.<br/>{' '}Ready for permission.</h2><p>A living register of work and the conditions that come with it.</p><Link href="/works" className="plain-link">Explore the register</Link><div className="rail-note">No guesswork.<br/>Read the terms before you use the work.</div></aside>
      <div className="register-content"><div className="section-heading"><h2>Fresh on the register</h2><span className="mono small">{stats.data?stats.data.works+' works':'Live records'}</span></div>
        {register.loading?<Loading/>:register.error?<LoadError message={register.error} retry={register.reload}/>:register.data?.works.length?<div className="work-list">{register.data.works.slice(0,4).map(work=><WorkRow work={work} key={work.work_id}/>)}</div>:<div className="empty-register"><div className="empty-paper"><FileText size={33} strokeWidth={1}/><span>This space belongs<br/>to someone&apos;s next great thing.</span></div><h3>The register is open.</h3><p>Every work here comes from a real creator.<br/>Be the first to put yours on record.</p><Link className="button secondary" href="/register"><Plus size={17}/>Register your work</Link></div>}
      </div>
    </section>
    <section className="fair-hearing wrap"><div className="hearing-mark"><Scale size={54} strokeWidth={1.1}/></div><div><h2>When the line gets blurry,<br/>neither side gets to draw it.</h2><p>A neutral validator panel reads the work, the output, and your terms. The reasoning goes on a public docket. Because “trust me” is a pretty thin receipt.</p></div><Link href="/docket" className="button secondary">Read the docket</Link></section>
    <section className="closing-note wrap"><p>For the people who make.<br/>And the people who ask first.</p><Link href="/about" className="plain-link">Get to know Tithe</Link></section>
  </>;
}
