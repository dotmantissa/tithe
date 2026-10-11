import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
export class AppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function failure(error: unknown) {
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || 'Please check the form' }, { status: 400 });
  // Provider exceptions can contain request bodies and secrets. Never echo them.
  return NextResponse.json({ error: 'This service is taking a breather. Please try again shortly.' }, { status: 503 });
}
