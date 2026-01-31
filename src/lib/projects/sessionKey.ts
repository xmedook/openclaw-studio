export const buildSessionKey = (agentId: string, sessionId: string) => {
  const trimmedAgent = agentId.trim();
  const trimmedSession = sessionId.trim();
  return `agent:${trimmedAgent}:studio:${trimmedSession}`;
};

export const parseAgentIdFromSessionKey = (
  sessionKey: string,
  fallback: string = "main"
): string => {
  const match = sessionKey.match(/^agent:([^:]+):/);
  return match ? match[1] : fallback;
};
