import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {keccak256,parseTransaction,recoverTransactionAddress,type Hex,type TransactionSerialized} from 'viem';
import {AppError} from './errors';

function encryptionKey(){
  const secret=process.env.ACCOUNT_DERIVATION_SECRET;
  if(!secret||secret.length<64)throw new AppError('The signing service is unavailable.',503);
  return createHash('sha256').update('tithe:outbox:v1:'+secret).digest();
}
const associatedData=(subject:string,id:string)=>Buffer.from('tithe:studio:61999:'+subject+':'+id);
export function sealTransaction(raw:Hex,subject:string,id:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  cipher.setAAD(associatedData(subject,id));
  const encrypted=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);
  return ['v1',iv.toString('hex'),cipher.getAuthTag().toString('hex'),encrypted.toString('hex')].join('.');
}
export function openTransaction(value:string,subject:string,id:string):Hex{
  try{
    const [version,iv,tag,body,...extra]=value.split('.');
    if(version!=='v1'||extra.length||!iv||!tag||!body||!/^[0-9a-f]{24}$/.test(iv)||!/^[0-9a-f]{32}$/.test(tag)||!/^[0-9a-f]+$/.test(body)||body.length%2!==0||body.length>1000000)throw new Error('Invalid envelope');
    const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'hex'));
    cipher.setAAD(associatedData(subject,id));cipher.setAuthTag(Buffer.from(tag,'hex'));
    const raw=Buffer.concat([cipher.update(Buffer.from(body,'hex')),cipher.final()]).toString('utf8');
    if(!/^0x[0-9a-f]+$/i.test(raw))throw new Error('Invalid transaction');
    return raw as Hex;
  }catch{throw new AppError('The saved transaction needs operator recovery. No replacement payment was submitted.',503);}
}
export async function validateSavedTransaction(raw:Hex,hash:string,address:string,nonce:string){
  const parsed=parseTransaction(raw);
  if(keccak256(raw)!==hash||parsed.chainId!==61999||String(parsed.nonce)!==nonce||(await recoverTransactionAddress({serializedTransaction:raw as TransactionSerialized})).toLowerCase()!==address.toLowerCase()){
    throw new AppError('The saved transaction does not match this operation. No payment was submitted.',503);
  }
}
export function retryDelay(attempts:number){return Math.min(3600,15*2**Math.min(attempts,8));}
