import { HttpException, HttpStatus } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Lightweight in-memory rate limit (per-process).
 * Enough to blunt brute-force login/register without a Redis dependency.
 */
export function assertRateLimit(
  key: string,
  max: number,
  windowMs: number,
): void {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  existing.count += 1;
  if (existing.count > max) {
    throw new HttpException(
      'Too many attempts — try again shortly',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
