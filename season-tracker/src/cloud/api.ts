import { getAdminToken } from './session';

/**
 * Talking to the database API (see api/_lib/router.js). Reads need nothing;
 * writes carry the admin pass in an Authorization header, never in the URL, so
 * it stays out of browser history and server logs.
 */

const BASE = '/api/db';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** True when the failure is "you are not the owner" rather than a real fault. */
export const isAuthError = (err: unknown): boolean =>
  err instanceof ApiError && (err.status === 401 || err.status === 403);

/** True when the thing asked for simply is not there. */
export const isMissing = (err: unknown): boolean => err instanceof ApiError && err.status === 404;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // The owner reads straight after writing — a replay attached, a round
  // re-uploaded — so their reads skip every cache between here and the
  // database: the browser's, and (by a URL no visitor asks for) the CDN's.
  // A cached copy from before the write would show the change undone.
  const url = token && method === 'GET'
    ? `${BASE}${path}${path.includes('?') ? '&' : '?'}fresh=${Date.now()}`
    : `${BASE}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: token ? 'no-store' : 'default',
    });
  } catch {
    // A dead network and a dead deployment look the same from here; say the
    // thing the reader can act on.
    throw new ApiError(0, 'Could not reach the database — check your connection.');
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error
      ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

export const apiGet = <T>(path: string) => request<T>('GET', path);
export const apiPost = <T>(path: string, body: unknown) => request<T>('POST', path, body);
export const apiPut = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
export const apiDelete = <T>(path: string) => request<T>('DELETE', path);

/** Query-string encoder that leaves an absent value out entirely. */
export const qs = (params: Record<string, string | undefined>): string => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};
