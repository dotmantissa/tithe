import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { AppError } from './errors';
import sharp from 'sharp';

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !address.toLowerCase().startsWith('2001:db8:');
  if (isIP(address) !== 4) return false;
  const [a,b] = address.split('.').map(Number);
  return a > 0 && a < 224 && ![10,127].includes(a) && !(a===169 && b===254) && !(a===172 && b>=16 && b<=31) && !(a===192 && [0,168].includes(b)) && !(a===100 && b>=64 && b<=127) && !(a===198 && [18,19,51].includes(b)) && !(a===203 && b===0);
}
export function artifactURL(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError('Enter a valid public URL.'); }
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname) || /\.(local|localhost|internal|home|lan|invalid|test)$/.test(url.hostname) || /[\\\s]/.test(input) || url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || !url.hostname.includes('.') || input.length > 2048) {
    throw new AppError('Use a public HTTPS URL without credentials, fragments or a custom port.');
  }
  return url;
}
export async function inspectArtifact(input: string) {
  const url = artifactURL(input);
  const addresses = await lookup(url.hostname, { all: true }).catch(() => { throw new AppError('We could not find that website.'); });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new AppError('Private network addresses are not accepted.');
  // Every candidate was checked above. Pin one address per connection so a
  // second DNS answer cannot redirect the request into a private network.
  let raw:Buffer|undefined;
  const candidates=[...addresses].sort((a,b)=>a.family-b.family).slice(0,3);
  for(const chosen of candidates) {
    try { raw = await new Promise<Buffer>((resolve, reject) => {
    const req = httpsRequest(url, {
      agent: false, method: 'GET', family: chosen.family,
      headers: { 'User-Agent': 'Tithe/1.0', 'Accept-Encoding': 'identity' },
      lookup: (_host, options, callback) => {
        queueMicrotask(()=>{
          if (options.all) callback(null, [chosen]);
          else callback(null, chosen.address, chosen.family);
        });
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
    const deadline=setTimeout(()=>req.destroy(new Error('Download deadline')),10000);
    req.on('close',()=>clearTimeout(deadline));
    req.on('error', reject);
    req.end();
    }); break;
    } catch(error) {
      if(error instanceof AppError)throw error;
      if(chosen===candidates[candidates.length-1])throw new AppError('We could not fetch that artifact. Please try again or check the public URL.');
    }
  }
  if (!raw?.length) throw new AppError('That artifact is empty.');
  return validateArtifactBytes(raw,input);
}

export async function validateArtifactBytes(raw:Buffer,input:string) {
  if(!raw.length||raw.length>2000000)throw new AppError('Keep the artifact between 1 byte and 2 MB.');
  const png = raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = raw.subarray(0,3).equals(Buffer.from([255,216,255]));
  const webp = raw.subarray(0,4).toString()==='RIFF' && raw.subarray(8,12).toString()==='WEBP';
  if(jpeg)throw new AppError('Please convert this JPEG to PNG or WebP. The Studio image decoder supports those formats.');
  const kind = png || webp ? 'image' : 'text';
  if ((png || webp) && animatedImage(raw,png)) throw new AppError('Choose a still image. Animated images are not supported.');
  if(kind==='image'){
    try{
      const decoder=sharp(raw,{limitInputPixels:16000000,failOn:'warning',animated:true});
      const metadata=await decoder.metadata();
      if(!['png','webp'].includes(metadata.format||''))throw new AppError('Choose PNG or WebP.');
      if((metadata.pages||1)!==1)throw new AppError('Choose a still image. Animated images are not supported.');
      if(!metadata.width||!metadata.height||metadata.width>4096||metadata.height>4096||metadata.width*metadata.height>16000000)throw new AppError('Keep image dimensions below 4097 pixels and 16 million pixels in total.');
      await decoder.raw().toBuffer();
    }catch(error){if(error instanceof AppError)throw error;throw new AppError('That image cannot be decoded. Choose a complete PNG or WebP.');}
  }
  if (kind === 'text') {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { throw new AppError('Choose UTF8 text, PNG or WebP.'); }
    if (text.includes('\0') || [...text].length > 24000) throw new AppError('Text must contain at most 24000 characters.');
  }
  return { content_hash: createHash('sha256').update(raw).digest('hex'), kind, bytes: raw.length, url: input };
}

function animatedImage(raw:Buffer,png:boolean){
  let offset=png?8:12;
  while(offset+8<=raw.length){
    const size=png?raw.readUInt32BE(offset):raw.readUInt32LE(offset+4);
    const kind=raw.subarray(png?offset+4:offset,png?offset+8:offset+4).toString();
    if(kind===(png?'acTL':'ANIM'))return true;
    offset+=png?size+12:size+8+size%2;
  }
  return false;
}
