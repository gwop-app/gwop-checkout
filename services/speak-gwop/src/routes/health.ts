import { Router } from 'express';
import { checkoutBridgeInfo } from '../integrations/checkoutBridge.js';
import type { AppContext } from '../types/appContext.js';

export function createHealthRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    try {
      const [agentStats, balanceStats, orderStats, queueStats, redisPing] = await Promise.all([
        ctx.agents.stats(),
        ctx.balances.stats(),
        ctx.creditOrders.stats(),
        ctx.store.stats(),
        ctx.jobQueue.ping(),
      ]);

      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        provider: ctx.provider.name,
        agents: agentStats,
        balances: balanceStats,
        checkout: checkoutBridgeInfo(ctx.checkoutBridge),
        credit_orders: orderStats,
        queue: {
          backend: 'redis',
          redis_ping: redisPing,
          jobs: queueStats,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Health check failed';
      res.status(500).json({
        status: 'error',
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message,
        },
      });
    }
  });

  return router;
}
