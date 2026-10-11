import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { AppError } from './errors';

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !address.toLowerCase().startsWith('2001:db8:');
  if (isIP(address) !== 4) return false;
  const [a,b] = address.split('.').map(Number);
  return a > 0 && a < 224 && ![10,127].includes(a) && !(a===169 && b===254) && !(a===172 && b>=16 && b<=31) && !(a===192 && [0,168].includes(b)) && !(a===100 && b>=64 && b<=127) && !(a===198 && [18,19,51].includes(b)) && !(a===203 && b===0);
}
export function artifactURL(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError('Enter a valid public URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || !url.hostname.includes('.') || input.length > 2048) {
    throw new AppError('Use a public HTTPS URL without credentials, fragments or a custom port.');
  }
  return url;
}
export async function inspectArtifact(input: string) {
  const url = artifactURL(input);
  const addresses = await lookup(url.hostname, { all: true }).catch(() => { throw new AppError('We could not find that website.'); });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new AppError('Private network addresses are not accepted.');
  const chosen = addresses[0];
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const req = httpsRequest(url, {
      agent: false, method: 'GET', timeout: 12000,
      headers: { 'User-Agent': 'Tithe/1.0', 'Accept-Encoding': 'identity' },
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [chosen]);
        else callback(null, chosen.address, chosen.family);
      },
    }, res => {
      if (res.statusCode !== 200) { res.resume(); reject(new AppError('The URL must return the artifact directly. Redirects and private pages cannot be registered.')); return; }
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2000000) req.destroy(new AppError('Keep the artifact below 2 MB.'));
        else chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => reject(new AppError('The website interrupted the download.')));
    });
    req.on('timeout', () => req.destroy(new AppError('That website took too long to respond.')));
    req.on('error', error => reject(error instanceof AppError ? error : new AppError('We could not fetch that artifact.')));
    req.end();
  });
  if (!raw.length) throw new AppError('That artifact is empty.');
  const png = raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = raw.subarray(0,3).equals(Buffer.from([255,216,255]));
  const webp = raw.subarray(0,4).toString()==='RIFF' && raw.subarray(8,12).toString()==='WEBP';
  const kind = png || jpeg || webp ? 'image' : 'text';
  if ((png && raw.includes(Buffer.from('acTL'))) || (webp && raw.includes(Buffer.from('ANIM')))) throw new AppError('Choose a still image. Animated images are not supported.');
  if (kind === 'text') {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { throw new AppError('Choose UTF8 text, PNG, JPEG or WebP.'); }
    if (text.includes('\0') || text.length > 24000) throw new AppError('Text must contain at most 24000 characters.');
  }
  return { content_hash: createHash('sha256').update(raw).digest('hex'), kind, bytes: raw.length, url: input };
}
