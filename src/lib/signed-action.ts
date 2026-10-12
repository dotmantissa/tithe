import {parseTransaction,decodeFunctionData,type Hex,type Abi} from 'viem';
import {abi} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import type {CalldataEncodable} from 'genlayer-js/types';
import {AppError} from './errors';
export function validateSignedAction(raw:Hex,sender:string,recipient:string,method:string,args:CalldataEncodable[],value:bigint){
 try{
  const main=studionet.consensusMainContract;if(!main)throw new Error('Missing Studio dispatch');
  const tx=parseTransaction(raw),base=(main.abi as Abi).find(entry=>entry.type==='function'&&entry.name==='addTransaction');
  if(!base||!('inputs' in base)||!tx.data)throw new Error('Missing dispatch');
  const dispatch=[base,{...base,inputs:[...base.inputs,{name:'_validUntil',type:'uint256'}]}] as Abi;
  const decoded=decodeFunctionData({abi:dispatch,data:tx.data}),fields=decoded.args as readonly unknown[];
  const expected=abi.transactions.serialize([abi.calldata.encode(abi.calldata.makeCalldataObject(method,args,undefined)),false]);
  if(tx.chainId!==61999||tx.to?.toLowerCase()!==main.address.toLowerCase()||(tx.value||0n)!==value||decoded.functionName!=='addTransaction'||String(fields[0]).toLowerCase()!==sender.toLowerCase()||String(fields[1]).toLowerCase()!==recipient.toLowerCase()||BigInt(String(fields[2]))!==BigInt(studionet.defaultNumberOfInitialValidators)||BigInt(String(fields[3]))!==BigInt(studionet.defaultConsensusMaxRotations)||fields[4]!==expected)throw new Error('Dispatch mismatch');
 }catch{throw new AppError('The signed transaction does not match the approved action. Nothing was broadcast.',503);}
}
