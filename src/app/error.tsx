'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="not-found"><h1>A small interruption.</h1><p>We could not finish opening this page. Your recorded work is still on GenLayer.</p><button className="button" onClick={reset}>Try again</button></div>;}
