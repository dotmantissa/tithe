export type UseClass = 'research' | 'commercial' | 'quote' | 'derivative';
export interface Terms {
  terms_text: string; clauses: string[]; price_schedule_atto: Partial<Record<UseClass, string>>;
  licence_class: UseClass; effective_at: number;
}
export interface Work {
  work_id: string; creator: string; title: string; url: string; content_hash: string;
  kind: 'text' | 'image'; version: number; registered_at: number; terms: Terms;
}
export interface Licence {
  licence_id: string; work_id: string; holder: string; creator: string; terms_version: number;
  use_class: UseClass; intended_use: string; fee_atto: string; issued_at: number;
  release_at: number; decision: 'APPROVE' | 'REFUSE'; clause: string; reason: string; fee_released: boolean;
}
export interface Ruling {
  decision: 'USE' | 'NO_USE' | 'DERIVATIVE_WITHIN_TERMS'; clause: string;
  reason: string; terms_basis: 'USE_TERMS' | 'LICENCE_TERMS'; terms_version: number; damages_band: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'; distance_ppm: number; policy_hash: string;
}
export interface Claim {
  claim_id: string; work_id: string; claimant: string; respondent: string; output_url: string;
  output_hash: string; used_at: number; terms_version: number; status: string;
  filed_at: number; response_deadline: number; bond_atto: string; policy_url: string; policy_hash: string; policy_text: string; licence_id: string; time_agreed: boolean; hearing_deadline?: number; recovery_reason?: string; time_proposal?: {by:string;used_at:number;terms_version:number};
  appeals?: {appealer:string;bond_atto:string;previous_ruling:Ruling;posted_at:number;completed_at?:number;outcome?:'REVIEWED'|'EXPIRED';bond_returned?:boolean}[]; ruling?: Ruling; ruled_at?: number; settle_after?: number; damages_atto?: string;
}
export interface Operation {
  id: string; tx_hash: string | null; kind: string; status: string; error?: string | null; created_at: string; result?: {record_id:string|null;contract:string;method:string};
}
export interface Account {
  address: string; balance_atto: string; credit_atto: string; court_credit_atto: string;
  pages:Record<'works'|'licences'|'claims'|'operations',{offset:number;has_more:boolean}>; bond_atto: string; works: Work[]; licences: Licence[]; claims: Claim[]; operations: Operation[];
}
