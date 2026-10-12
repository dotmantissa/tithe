import {it,expect} from 'vitest';
import sharp from 'sharp';
import {validateArtifactBytes,artifactURL} from '../../src/lib/artifacts';
it.each(['png'] as const)('fully decodes a valid %s before fingerprinting',async(format)=>{
 const raw=await sharp({create:{width:4,height:4,channels:3,background:'#ff90e8'}}).toFormat(format).toBuffer();
 expect(await validateArtifactBytes(raw,'https://example.org/image')).toMatchObject({kind:'image',bytes:raw.length});
});
it.each([Buffer.from('\x89PNG\r\n\x1a\nnot-an-image','latin1'),Buffer.from('\xff\xd8\xffnot-an-image','latin1'),Buffer.from('RIFF\0\0\0\0WEBPnot-an-image')])('rejects image magic without a decodable image',async(raw)=>await expect(validateArtifactBytes(raw,'https://example.org/image')).rejects.toThrow());
it('rejects excessive image dimensions before pixel allocation',async()=>{
 const raw=await sharp({create:{width:4097,height:1,channels:3,background:'#ffffff'}}).png().toBuffer();
 await expect(validateArtifactBytes(raw,'https://example.org/image')).rejects.toThrow('dimensions');
});
it.each(['https://100.64.0.1/a','https://198.18.0.1/a','https://private.local/a','https://example.org\\@private.local/a'])('refuses nonpublic host syntax %s',url=>expect(()=>artifactURL(url)).toThrow());

it('rejects even a valid JPEG because the pinned Studio runner lacks that decoder',async()=>{const raw=await sharp({create:{width:4,height:4,channels:3,background:'#ff90e8'}}).jpeg().toBuffer();await expect(validateArtifactBytes(raw,'https://example.org/image')).rejects.toThrow('convert');});

it('rejects even a valid WebP before the native decoder can trap',async()=>{const raw=await sharp({create:{width:4,height:4,channels:3,background:'#ff90e8'}}).webp().toBuffer();await expect(validateArtifactBytes(raw,'https://example.org/image')).rejects.toThrow('convert');});
