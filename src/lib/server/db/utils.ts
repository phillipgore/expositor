import { client, db } from './index.js';
import { runDatabaseDiagnostics, type DatabaseHealth, type ConnectionPoolMetrics } from './health.js';

/**
 * Get comprehensive database status for monitoring
 */
export async function getDatabaseStatus(): Promise<{
  health: DatabaseHealth;
  poolMetrics: ConnectionPoolMetrics | null;
  isReady: boolean;
}> {
  return await runDatabaseDiagnostics(client);
}

/**
 * Simple health check for API endpoints
 */
export async function isHealthy(): Promise<boolean> {
  try {
    const status = await getDatabaseStatus();
    return status.health.status === 'healthy' && status.isReady;
  } catch {
    return false;
  }
}

/**
 * Retry database operation with exponential backoff
 */
export async function retryDatabaseOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
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
  
  throw lastError!;
}

/**
 * Execute database operation with automatic retry
 */
export async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  return retryDatabaseOperation(operation);
}

/**
 * Log database performance metrics
 */
export async function logDatabaseMetrics(): Promise<void> {
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
