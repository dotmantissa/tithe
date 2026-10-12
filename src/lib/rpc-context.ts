import {AsyncLocalStorage} from 'node:async_hooks';
export type RpcClass='public'|'authenticated'|'maintenance'|'recovery';
const context=new AsyncLocalStorage<RpcClass>();
export const rpcClass=()=>context.getStore()||'recovery';
export const withRpcClass=<T>(kind:RpcClass,action:()=>T):T=>context.run(kind,action);
