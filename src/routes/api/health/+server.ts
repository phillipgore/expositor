import { json } from '@sveltejs/kit';
import { getDatabaseStatus } from '$lib/server/db/utils.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    const status = await getDatabaseStatus();
    
    return json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        health: status.health.status,
        responseTime: status.health.responseTime,
        ready: status.isReady,
        poolMetrics: status.poolMetrics
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      database: {
        health: 'unhealthy',
        ready: false
      }
    }, { status: 503 });
  }
};
