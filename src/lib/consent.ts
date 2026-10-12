import {createHmac,timingSafeEqual} from 'node:crypto';
import {AppError} from './errors';
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return value;
}
export function consentSeal(value:unknown){
 const secret=process.env.ACCOUNT_DERIVATION_SECRET;if(!secret||secret.length<64)throw new AppError('The consent signing service is unavailable.',503);
 return createHmac('sha256',secret).update('tithe:consent:v1:'+JSON.stringify(canonical(value))).digest('hex');
}
export function verifyConsent(value:unknown,seal:string){
 const expected=Buffer.from(consentSeal(value),'hex'),provided=Buffer.from(seal||'','hex');
 if(provided.length!==expected.length||!timingSafeEqual(provided,expected))throw new AppError('The saved approval could not be verified. No new transaction was signed.',503);
}
