import './network';
import { neon } from '@neondatabase/serverless';
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('The index is not configured');
  return neon(process.env.DATABASE_URL);
}
