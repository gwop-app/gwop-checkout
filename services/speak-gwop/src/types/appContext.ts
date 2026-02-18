import type { AgentStore } from '../core/agentStore.js';
import type { CreditBalanceStore } from '../core/creditBalanceStore.js';
import type { CreditOrderStore } from '../core/creditOrderStore.js';
import type { JobStore } from '../core/jobStore.js';
import type { CheckoutBridge } from '../integrations/checkoutBridge.js';
import type { GwopIntegration } from '../integrations/gwop.js';
import type { TtsQueue } from '../queue/ttsQueue.js';
import type { TtsProvider } from './tts.js';

export interface AppContext {
  provider: TtsProvider;
  store: JobStore;
  agents: AgentStore;
  balances: CreditBalanceStore;
  creditOrders: CreditOrderStore;
  jobQueue: TtsQueue;
  gwop: GwopIntegration;
  checkoutBridge: CheckoutBridge;
}
