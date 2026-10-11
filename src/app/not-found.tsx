import Link from 'next/link';
export default function NotFound(){return <div className="not-found"><h1>A page without a record.</h1><p>This link does not lead anywhere yet. The register is a good place to start.</p><Link className="button" href="/works">Back to the register</Link></div>;}
