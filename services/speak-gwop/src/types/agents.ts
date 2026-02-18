export interface SpeakAgent {
  id: string;
  name: string;
  status: 'ACTIVE';
  created_at: string;
  last_seen_at: string;
}

export interface SpeakAgentSession {
  agent_id: string;
  token: string;
  token_type: 'Bearer';
  expires_at: string;
}
