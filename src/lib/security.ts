import { createHash, timingSafeEqual } from 'node:crypto';
import { PrivyClient } from '@privy-io/server-auth';
import { database } from './db';
import { AppError } from './errors';
import {isIP} from 'node:net';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export async function authenticate(request: Request, allowKeys=true): Promise<string> {
  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!token) throw new AppError('Sign in with your email to continue.', 401);
  if (token.startsWith('tithe_')) {
    if(!allowKeys) throw new AppError('Use your email session to manage API keys.',401);
    const rows = await database()`SELECT subject FROM tithe_keys WHERE digest=${digest(token)} AND revoked_at IS NULL`;
    if (!rows[0]) throw new AppError('This API key is invalid or has been revoked.', 401);
    return rows[0].subject as string;
  }
  try {
    const client = new PrivyClient(process.env.PRIVY_APP_ID!, process.env.PRIVY_APP_SECRET!);
    const claims = await client.verifyAuthToken(token);
    const user = await client.getUser(claims.userId);
    if (!user.email?.address) throw new AppError('Use an email account to sign in.', 401);
    return claims.userId;
  } catch {
    throw new AppError('Your session has expired. Please sign in again.', 401);
  }
}
export async function readJSON(request:Request) {
  const reader=request.body?.getReader();
  if(!reader) throw new AppError('Send a JSON request body.');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){
    const {done,value}=await reader.read();if(done)break;
    size+=value.length;
    if(size>64000){await reader.cancel();throw new AppError('That request is too large.',413);}
    chunks.push(value);
  }
  const raw=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
  catch{throw new AppError('Send valid JSON.');}
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && origin !== process.env.NEXT_PUBLIC_APP_URL) {
    throw new AppError('This request came from an unexpected website.', 403);
  }
}
export async function limit(scope: string, maximum = 30, periodMs = 60000) {
  const window = Math.floor(Date.now() / periodMs);
  const rows = await database()`INSERT INTO tithe_limits(scope,bucket) VALUES(${scope},${window}) ON CONFLICT(scope,bucket) DO UPDATE SET count=tithe_limits.count+1 RETURNING count`;
  if (Number(rows[0].count) > maximum) throw new AppError('A little too fast. Please try again in a minute.', 429);
}

export function authorizeMaintenance(request:Request){
  const secret=process.env.CRON_SECRET;
  const provided=Buffer.from(request.headers.get('authorization')||'');
  const expected=Buffer.from(secret?'Bearer '+secret:'');
  if(!secret||provided.length!==expected.length||!timingSafeEqual(provided,expected))throw new AppError('Unauthorized.',401);
}

export async function limitPublic(request:Request){
  // Trust only the hosting platform's overwritten header. Self-hosted installs
  // share an anonymous bucket unless an explicitly trusted proxy is configured.
  const header=process.env.VERCEL==='1'?'x-vercel-forwarded-for':process.env.TRUSTED_CLIENT_IP_HEADER;
  const candidate=header?request.headers.get(header)?.split(',')[0].trim():undefined;
  const caller=candidate&&isIP(candidate)?candidate:'shared-anonymous';
  await limit('public:'+digest(caller),20);
  await limit('public-hour:'+digest(caller),120,3600000);
}
