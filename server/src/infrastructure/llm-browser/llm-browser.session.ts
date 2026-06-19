import type { LlmBrowserProvider, LlmBrowserSession, LlmSessionStatus } from './llm-browser.types.js';

const sessions = new Map<string, LlmBrowserSession>();

function sessionKey(profileId: string, provider: LlmBrowserProvider): string {
  return `${profileId}:${provider}`;
}

export function getLlmBrowserSession(
  profileId: string,
  provider: LlmBrowserProvider,
): LlmBrowserSession | undefined {
  return sessions.get(sessionKey(profileId, provider));
}

export function requireLlmBrowserSession(
  profileId: string,
  provider: LlmBrowserProvider,
): LlmBrowserSession {
  const session = getLlmBrowserSession(profileId, provider);
  if (!session) {
    throw new Error('LLM browser session not found');
  }
  return session;
}

export function upsertLlmBrowserSession(profileId: string, provider: LlmBrowserProvider): LlmBrowserSession {
  const key = sessionKey(profileId, provider);
  const existing = sessions.get(key);
  if (existing) {
    return existing;
  }

  const session: LlmBrowserSession = {
    profileId,
    provider,
    openedAt: new Date().toISOString(),
    status: 'idle',
  };
  sessions.set(key, session);
  return session;
}

export function setLlmBrowserSessionStatus(
  profileId: string,
  provider: LlmBrowserProvider,
  status: LlmSessionStatus,
  extra?: Pick<LlmBrowserSession, 'pendingBaselineBlockCount'>,
): LlmBrowserSession {
  const session = requireLlmBrowserSession(profileId, provider);
  const next = { ...session, status, ...extra };
  sessions.set(sessionKey(profileId, provider), next);
  return next;
}

export function clearLlmBrowserSessionPendingBaseline(
  profileId: string,
  provider: LlmBrowserProvider,
): LlmBrowserSession {
  const session = requireLlmBrowserSession(profileId, provider);
  const { pendingBaselineBlockCount: _removed, ...rest } = session;
  const next = rest as LlmBrowserSession;
  sessions.set(sessionKey(profileId, provider), next);
  return next;
}

export function clearLlmBrowserSession(profileId: string, provider: LlmBrowserProvider): void {
  sessions.delete(sessionKey(profileId, provider));
}

export function clearLlmBrowserSessionsForProfile(profileId: string): void {
  for (const key of sessions.keys()) {
    if (key.startsWith(`${profileId}:`)) {
      sessions.delete(key);
    }
  }
}
