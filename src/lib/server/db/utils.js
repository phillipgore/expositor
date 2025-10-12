import { client, db } from './index.js';
import { runDatabaseDiagnostics } from './health.js';

/**
 * Get comprehensive database status for monitoring
 * @returns {Promise<{health: import('./health.js').DatabaseHealth, poolMetrics: import('./health.js').ConnectionPoolMetrics | null, isReady: boolean}>}
 */
export async function getDatabaseStatus() {
  return await runDatabaseDiagnostics(client);
}

/**
 * Simple health check for API endpoints
 * @returns {Promise<boolean>}
 */
export async function isHealthy() {
  try {
    const status = await getDatabaseStatus();
    return status.health.status === 'healthy' && status.isReady;
  } catch {
    return false;
  }
}

/**
 * Retry database operation with exponential backoff
 * @template T
 * @param {() => Promise<T>} operation
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelay=1000]
 * @returns {Promise<T>}
 */
export async function retryDatabaseOperation(
  operation,
  maxRetries = 3,
  baseDelay = 1000
) {
  /** @type {Error} */
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${Math.round(delay)}ms:`, lastError.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Execute database operation with automatic retry
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
export async function withRetry(operation) {
  return retryDatabaseOperation(operation);
}

/**
 * Log database performance metrics
 * @returns {Promise<void>}
 */
export async function logDatabaseMetrics() {
  try {
    const status = await getDatabaseStatus();
    
    console.log('📊 Database Metrics:');
    console.log(`   Status: ${status.health.status}`);
    console.log(`   Response Time: ${status.health.responseTime}ms`);
    console.log(`   Ready: ${status.isReady ? 'Yes' : 'No'}`);
    
    if (status.poolMetrics) {
      console.log(`   Pool - Total: ${status.poolMetrics.totalConnections}`);
      console.log(`   Pool - Active: ${status.poolMetrics.activeConnections}`);
      console.log(`   Pool - Idle: ${status.poolMetrics.idleConnections}`);
      console.log(`   Pool - Waiting: ${status.poolMetrics.waitingConnections}`);
    }
  } catch (error) {
    console.error('Failed to log database metrics:', error);
  }
}

// Export the database instance and client for convenience
export { db, client };
