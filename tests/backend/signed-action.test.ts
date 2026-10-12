import {it,expect} from 'vitest';
import {abi} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {privateKeyToAccount} from 'viem/accounts';
import {encodeFunctionData} from 'viem';
import {validateSignedAction} from '../../src/lib/signed-action';
const signer=privateKeyToAccount(('0x'+'1'.repeat(64)) as `0x${string}`),recipient=('0x'+'2'.repeat(40)) as `0x${string}`;
async function signed(method='fund_credit',value=100n,leader=false){const data=encodeFunctionData({abi:studionet.consensusMainContract!.abi,functionName:'addTransaction',args:[signer.address,recipient,studionet.defaultNumberOfInitialValidators,studionet.defaultConsensusMaxRotations,abi.transactions.serialize([abi.calldata.encode(abi.calldata.makeCalldataObject(method,[],undefined)),leader])]});return signer.signTransaction({type:'legacy',nonce:3,chainId:61999,to:studionet.consensusMainContract!.address,value,data,gas:200000n,gasPrice:0n});}
it('binds exact native funding and the complete consensus dispatch',async()=>{const raw=await signed();expect(()=>validateSignedAction(raw,signer.address,recipient,'fund_credit',[],100n)).not.toThrow();});
it('rejects changed value, destination, method, arguments and leader-only dispatch before broadcast',async()=>{const raw=await signed();for(const [target,method,args,value] of [[signer.address,'fund_credit',[],100n],[recipient,'withdraw',[],100n],[recipient,'fund_credit',['changed'],100n],[recipient,'fund_credit',[],101n]] as const)expect(()=>validateSignedAction(raw,signer.address,target,method,[...args],value)).toThrow('Nothing was broadcast');const leader=await signed('fund_credit',100n,true);expect(()=>validateSignedAction(leader,signer.address,recipient,'fund_credit',[],100n)).toThrow();});
it('accepts the actual zero-value RLP representation without treating it as missing consent',async()=>{const raw=await signed('fund_credit',0n);expect(()=>validateSignedAction(raw,signer.address,recipient,'fund_credit',[],0n)).not.toThrow();});
