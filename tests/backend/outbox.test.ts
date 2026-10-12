import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {keccak256} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {sealTransaction,openTransaction,validateSavedTransaction,retryDelay} from '../../src/lib/outbox';
const account=privateKeyToAccount('0x'+'1'.repeat(64) as `0x${string}`);
beforeEach(()=>vi.stubEnv('ACCOUNT_DERIVATION_SECRET','b'.repeat(64)));
afterEach(()=>vi.unstubAllEnvs());
async function signed(){return account.signTransaction({chainId:61999,type:'legacy',nonce:7,to:'0x'+'2'.repeat(40) as `0x${string}`,value:100n,gas:21000n,gasPrice:0n});}
it('encrypts a recoverable transaction without storing its plaintext',async()=>{
 const raw=await signed(),sealed=sealTransaction(raw,'subject','operation');
 expect(sealed).not.toContain(raw);expect(openTransaction(sealed,'subject','operation')).toBe(raw);
 await expect(validateSavedTransaction(raw,keccak256(raw),account.address,'7')).resolves.toBeUndefined();
});
it('uses a fresh nonce for each encrypted envelope',async()=>{
 const raw=await signed();expect(sealTransaction(raw,'subject','operation')).not.toBe(sealTransaction(raw,'subject','operation'));
});
it('refuses cross-account, cross-operation and modified ciphertext replays',async()=>{
 const sealed=sealTransaction(await signed(),'subject','operation');
 expect(()=>openTransaction(sealed,'another','operation')).toThrow('No replacement payment');
 expect(()=>openTransaction(sealed,'subject','another')).toThrow('No replacement payment');
 const parts=sealed.split('.');parts[3]=(parts[3][0]==='a'?'b':'a')+parts[3].slice(1);
 expect(()=>openTransaction(parts.join('.'),'subject','operation')).toThrow('No replacement payment');
});
it('binds the original hash, signer, network and transaction nonce',async()=>{
 const raw=await signed();
 for(const [hash,address,nonce] of [['0x'+'0'.repeat(64),account.address,'7'],[keccak256(raw),'0x'+'3'.repeat(40),'7'],[keccak256(raw),account.address,'8']])await expect(validateSavedTransaction(raw,hash,address,nonce)).rejects.toThrow('No payment');
 const wrong=await account.signTransaction({chainId:1,type:'legacy',nonce:7,to:account.address,value:0n,gas:21000n,gasPrice:0n});
 await expect(validateSavedTransaction(wrong,keccak256(wrong),account.address,'7')).rejects.toThrow('No payment');
});
it('bounds recovery retries without dropping an uncertain payment',()=>{expect(retryDelay(1)).toBe(30);expect(retryDelay(100)).toBe(3600);});
