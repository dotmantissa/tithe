'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useTheme } from 'next-themes';
import { Sun, Moon, Menu, X, UserRound, Plus } from 'lucide-react';
import { useState } from 'react';
export function Logo({small=false}:{small?:boolean}) {
  return <span className={`brand ${small?'brand-small':''}`}><svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="9" fill="#ff90e8"/><path d="M8 10h25v7H23v15h-7V17H8z" fill="#000000"/><path d="M28 26h7v7h-7z" fill="#ffffff"/></svg><span>tithe<span className="brand-dot">.</span></span></span>;
}
export function Shell({children}:{children:React.ReactNode}) {
  const path=usePathname(),{login,authenticated,ready}=usePrivy(),{resolvedTheme,setTheme}=useTheme();
  const [menu,setMenu]=useState(false);
  const links=[['/works','The register'],['/docket','The docket'],['/developers','For agents']];
  return <>
    <a href="#main" className="skip-link">Skip to content</a>
    <header className="site-header">
      <Link href="/" aria-label="Tithe home"><Logo/></Link>
      <nav aria-label="Main navigation" className={menu?'main-nav open':'main-nav'}>
        {links.map(([href,label])=><Link key={href} href={href} onClick={()=>setMenu(false)} aria-current={path.startsWith(href)?'page':undefined}>{label}</Link>)}
      </nav>
      <div className="header-actions">
        <button className="icon-button theme-toggle" onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')} aria-label="Switch light or dark mode"><Sun className="sun" size={19}/><Moon className="moon" size={19}/></button>
        {authenticated?<Link href="/account" className="account-link"><UserRound size={17}/><span>My desk</span></Link>:<button className="text-button signin" disabled={!ready} onClick={login}>Sign in</button>}
        <Link href="/register" className="button compact"><Plus size={17}/><span>Register a work</span></Link>
        <button className="icon-button mobile-menu" aria-label={menu?'Close navigation':'Open navigation'} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X size={21}/>:<Menu size={21}/>}</button>
      </div>
    </header>
    <main id="main">{children}</main>
    <footer className="site-footer">
      <div><Link href="/" aria-label="Tithe home"><Logo small/></Link><p>Give credit. Return a little.</p></div>
      <div className="footer-links"><Link href="/about">How Tithe works</Link><a href="https://github.com/dotmantissa/tithe" target="_blank" rel="noreferrer">The source code</a><Link href="/developers">Build with Tithe</Link></div>
      <div className="footer-note"><span className="network-dot"/>GenLayer Studio<p>Private licensing and arbitration.<br/>A fair record, not a court judgment.</p></div>
    </footer>
  </>;
}
