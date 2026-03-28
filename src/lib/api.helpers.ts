import type { ApiError } from '../types';

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
): Response {
  const body: ApiError = { error: { code, message, ...(details ? { details } : {}) } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonSuccess<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
