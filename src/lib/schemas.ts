import { z } from 'zod';
const id = z.string().regex(/^[0-9a-f]{64}$/, 'Choose a registered record.');
const url = z.string().url('Enter a public HTTPS URL.').max(2048);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Enter the respondent account address.');
export const useClass = z.enum(['research','commercial','quote','derivative']);
const prices = z.partialRecord(useClass,z.string().regex(/^\d+$/, 'Prices must be decimal atto amounts.').refine(v=>BigInt(v)<2n**128n,'That price is too large.')).refine(v=>Object.keys(v).length>0,'Add at least one price.');
export const actionSchema = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('register'),title:z.string().trim().min(1).max(160),url,content_hash:id,terms_text:z.string().min(10).max(12000),prices,licence_class:useClass}),
  z.object({kind:z.literal('terms'),work_id:id,terms_text:z.string().min(10).max(12000),prices,licence_class:useClass}),
  z.object({kind:z.literal('licence'),work_id:id,intended_use_text:z.string().min(10).max(8000),use_class:useClass}),
  z.object({kind:z.literal('claim'),work_id:id,output_url:url,output_hash:id,respondent:address,used_at:z.number().int().positive()}),
  z.object({kind:z.literal('respond'),claim_id:id,policy_url:z.union([url,z.literal('')]).default(''),licence_id:z.union([id,z.literal('')]).default('')}),
  z.object({kind:z.enum(['rule','settle','cancel']),claim_id:id}),
  z.object({kind:z.literal('release'),licence_id:id}),
  z.object({kind:z.literal('withdraw'),contract:z.enum(['desk','court'])}),
  z.object({kind:z.literal('appeal'),claim_id:id}),
]);
export type Action = z.infer<typeof actionSchema>;
