import { NextResponse } from 'next/server';
import { authorizeMaintenance } from '@/lib/security';
import { maintain } from '@/lib/maintenance';
import { failure } from '@/lib/errors';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){
  try{
    authorizeMaintenance(request);
    return NextResponse.json(await maintain(),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
