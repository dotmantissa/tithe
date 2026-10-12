import { z } from 'zod';
const id = z.string().regex(/^[0-9a-f]{64}$/, 'Choose a registered record.');
const url = z.string().url('Enter a public HTTPS URL.').max(2048);
const bond = z.string().regex(/^\d+$/).refine(v=>BigInt(v)>0n&&BigInt(v)<2n**128n);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Enter the respondent account address.');
export const useClass = z.enum(['research','commercial','quote','derivative']);
const prices = z.partialRecord(useClass,z.string().regex(/^\d+$/, 'Prices must be decimal atto amounts.').refine(v=>BigInt(v)<2n**128n,'That price is too large.')).refine(v=>Object.keys(v).length>0,'Add at least one price.');
export const usageEvidenceSchema=z.strictObject({
  actual_use:z.string().trim().min(1).max(4000),
  distribution:z.string().trim().min(1).max(4000),
  commercial_activity:z.string().trim().min(1).max(4000),
  competing_product:z.string().trim().min(1).max(4000),
  attribution:z.string().trim().min(1).max(4000),
  supporting_evidence:z.string().trim().min(1).max(4000),
}).refine(v=>JSON.stringify(v).length<=12000,'Keep usage evidence below 12000 characters.');
export const actionSchema = z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('register'),title:z.string().trim().min(1).max(160),url,content_hash:id,terms_text:z.string().min(10).max(12000),prices,licence_class:useClass}),
  z.strictObject({kind:z.literal('terms'),work_id:id,terms_text:z.string().min(10).max(12000),prices,licence_class:useClass}),
  z.strictObject({kind:z.literal('licence'),work_id:id,intended_use_text:z.string().min(10).max(8000),use_class:useClass,expected_terms_version:z.number().int().min(1).max(128),expected_fee_atto:z.string().regex(/^\d+$/).refine(v=>BigInt(v)<2n**128n)}),
  z.strictObject({kind:z.literal('claim'),work_id:id,output_url:url,output_hash:id,respondent:address,used_at:z.number().int().positive(),terms_version:z.number().int().min(1).max(128),expected_bond_atto:bond,usage_evidence:usageEvidenceSchema}),
  z.strictObject({kind:z.literal('respond'),claim_id:id,policy_url:z.union([url,z.literal('')]).default(''),licence_id:z.union([id,z.literal('')]).default(''),accepted_used_at:z.number().int().positive(),accepted_terms_version:z.number().int().min(1).max(128),policy_hash:z.union([id,z.literal('')]).default(''),expected_bond_atto:bond,usage_evidence:usageEvidenceSchema}),
  z.strictObject({kind:z.enum(['rule','settle','cancel','recover']),claim_id:id}),
  z.strictObject({kind:z.literal('release'),licence_id:id}),
  z.strictObject({kind:z.literal('withdraw'),contract:z.enum(['desk','court'])}),
  z.strictObject({kind:z.literal('appeal'),claim_id:id,expected_round:z.number().int().min(1).max(3),expected_bond_atto:bond,grounds:z.string().trim().min(20).max(4000),additional_evidence:z.string().max(8000).default('')}),
  z.strictObject({kind:z.literal('review_response'),claim_id:id,expected_round:z.number().int().min(1).max(3),response:z.string().trim().min(20).max(8000)}),
  z.strictObject({kind:z.enum(['propose_time','accept_time']),claim_id:id,used_at:z.number().int().positive(),terms_version:z.number().int().min(1).max(128)}),
]);
export type Action = z.infer<typeof actionSchema>;
