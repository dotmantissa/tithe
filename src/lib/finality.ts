export const finality={state_variant:'latest-final',status:'FINALIZED'} as const;
export const finalized=<T extends object>(record:T)=>({...record,finality});
