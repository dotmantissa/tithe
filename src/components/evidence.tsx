'use client';
import type {UsageEvidence} from '@/lib/types';
export const emptyUsage:UsageEvidence={actual_use:'',distribution:'',commercial_activity:'',competing_product:'',attribution:'',supporting_evidence:''};
const fields:Record<keyof UsageEvidence,string>={actual_use:'Actual use and purpose',distribution:'Where and to whom it was distributed',commercial_activity:'Sales, charges or other commercial activity',competing_product:'Any competing product or service',attribution:'Attribution in the artifact and elsewhere',supporting_evidence:'Supporting evidence and how you know these facts'};
export function UsageFields({value,onChange}:{value:UsageEvidence;onChange:(v:UsageEvidence)=>void}){
 return <fieldset style={{border:0,padding:0,margin:'24px 0'}}><legend><strong>Your usage evidence</strong></legend><p className="help-text">Describe what happened, with concrete facts. Say “unknown” when you cannot establish a fact. Include relevant document excerpts and distinguish your observations from allegations. These statements will be public and preserved with your account signature.</p>{(Object.keys(fields) as (keyof UsageEvidence)[]).map(key=><label className="field" key={key}><span>{fields[key]}</span><textarea rows={key==='supporting_evidence'?4:2} required minLength={1} maxLength={4000} value={value[key]} onChange={e=>onChange({...value,[key]:e.target.value})}/></label>)}<small>Unsupported or disputed material facts can lead to an insufficient-evidence ruling, with no damages and returned bonds.</small></fieldset>;
}
export function UsageRecord({label,evidence,hash}:{label:string;evidence?:UsageEvidence;hash?:string}){
 if(!evidence)return null;
 return <details className="detail-section"><summary>{label}</summary><dl className="review-facts">{(Object.keys(fields) as (keyof UsageEvidence)[]).map(key=><div key={key}><dt>{fields[key]}</dt><dd style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{evidence[key]}</dd></div>)}{hash&&<div><dt>Statement hash</dt><dd className="hash-line">{hash}</dd></div>}</dl></details>;
}
