/**
 * AI-service client (FastAPI): face verification gates 1+4 and BizBot RAG.
 * Free hosts cold-start — callers must show progress states, never block silently
 * (SR-6). Auth: the user's Supabase access token, verified server-side.
 */

import { env } from './env';
import { getAccessToken } from './supabase';

export class AiServiceError extends Error {
  constructor(
    message: string,
    public status: number | 'network',
    public detail?: unknown,
  ) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) throw new AiServiceError('not signed in', 401);
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init: RequestInit, timeoutMs = 90_000): Promise<T> {
  // Generous timeout: a cold-starting free host can take ~60s (SETUP.md §8).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.aiServiceUrl}${path}`, {
      ...init,
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail =
        body && typeof body === 'object' && 'detail' in body
          ? (body as { detail: unknown }).detail
          : body;
      throw new AiServiceError(`AI service ${res.status}`, res.status, detail);
    }
    return body as T;
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    throw new AiServiceError('AI service unreachable (it may be cold-starting)', 'network');
  } finally {
    clearTimeout(timer);
  }
}

export interface FaceMatchResult {
  passed: boolean;
  similarity: number;
  threshold: number;
  verification_status: string;
}

async function uploadImage<T>(path: string, imageUri: string): Promise<T> {
  const headers = await authHeaders();
  const form = new FormData();
  // React Native FormData file part — the cast is the RN-documented shape.
  form.append('file', {
    uri: imageUri,
    name: 'capture.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);
  return request<T>(path, { method: 'POST', headers, body: form });
}

/** Gate 1: send the government-ID photo; the server stores its face embedding. */
export function embedIdImage(imageUri: string) {
  return uploadImage<{ status: string; dimensions: number }>('/face/embed-id', imageUri);
}

/** Gate 4: send the post-liveness selfie for cosine match vs the ID embedding. */
export function matchSelfie(imageUri: string) {
  return uploadImage<FaceMatchResult>('/face/match', imageUri);
}

export interface RagSource {
  title: string;
  source_name: string;
  source_url: string;
  similarity: number;
}

export interface RagAnswer {
  answer: string;
  sources: RagSource[];
  grounded: boolean;
  provider: string | null;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export async function askBizBot(
  question: string,
  history: ChatTurn[],
  parish?: string | null,
): Promise<RagAnswer> {
  const headers = await authHeaders();
  return request<RagAnswer>('/rag/query', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      country: 'JM',
      parish: parish ?? null,
      history: history.slice(-6),
    }),
  });
}

export async function pingAiService(): Promise<boolean> {
  try {
    await request<{ status: string }>('/health', { method: 'GET' }, 10_000);
    return true;
  } catch {
    return false;
  }
}
