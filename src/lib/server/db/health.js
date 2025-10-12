/**
 * @typedef {Object} DatabaseHealth
 * @property {'healthy' | 'unhealthy' | 'degraded'} status
 * @property {Date} timestamp
 * @property {number} responseTime
 * @property {number} [connectionCount]
 * @property {string} [error]
 */

/**
 * @typedef {Object} ConnectionPoolMetrics
 * @property {number} totalConnections
 * @property {number} idleConnections
 * @property {number} activeConnections
 * @property {number} waitingConnections
 */

/**
 * Perform a basic database health check
 * @param {import('postgres').Sql} db
 * @returns {Promise<DatabaseHealth>}
 */
export async function checkDatabaseHealth(db) {
  const startTime = Date.now();
  
  try {
    // Simple query to test database connectivity
    const result = await db`SELECT 1 as health_check, NOW() as server_time`;
    const responseTime = Date.now() - startTime;
    
    if (result.length > 0) {
      return {
        status: 'healthy',
        timestamp: new Date(),
        responseTime
      };
    } else {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime,
        error: 'No response from database'
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'unhealthy',
      timestamp: new Date(),
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown database error'
    };
  }
}

/**
 * Check if database is ready for connections
 * @param {import('postgres').Sql} db
 * @returns {Promise<boolean>}
 */
export async function checkDatabaseReadiness(db) {
  try {
    // Test basic connectivity and schema access
    await db`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LIMIT 1`;
    return true;
  } catch (error) {
    console.error('Database readiness check failed:', error);
    return false;
  }
}

/**
 * Get connection pool metrics (if available)
 * @param {import('postgres').Sql} client
 * @returns {ConnectionPoolMetrics | null}
 */
export function getConnectionPoolMetrics(client) {
  try {
    // Access internal connection pool state if available
    // Note: This is implementation-specific and may not work with all postgres.js versions
    const pool = /** @type {any} */ (client).pool;
    
    if (pool) {
      return {
        totalConnections: pool.total || 0,
        idleConnections: pool.idle || 0,
        activeConnections: pool.active || 0,
        waitingConnections: pool.waiting || 0
      };
    }
    
    return null;
  } catch (error) {
    console.warn('Could not retrieve connection pool metrics:', error);
    return null;
  }
}

/**
 * Perform comprehensive database diagnostics
 * @param {import('postgres').Sql} db
 * @returns {Promise<{health: DatabaseHealth, poolMetrics: ConnectionPoolMetrics | null, isReady: boolean}>}
 */
export async function runDatabaseDiagnostics(db) {
  const [health, isReady] = await Promise.all([
    checkDatabaseHealth(db),
    checkDatabaseReadiness(db)
  ]);
  
  const poolMetrics = getConnectionPoolMetrics(db);
  
  return {
    health,
    poolMetrics,
    isReady
  };
}

/**
 * Log database connection info on startup
 * @param {{host: string, port: string, database: string, ssl: boolean}} info
 */
export function logDatabaseConnection(info) {
  console.log('🗄️  Database Connection Info:');
  console.log(`   Host: ${info.host}:${info.port}`);
  console.log(`   Database: ${info.database}`);
  console.log(`   SSL: ${info.ssl ? 'enabled' : 'disabled'}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
}

/**
 * Graceful database shutdown
 * @param {import('postgres').Sql} db
 * @returns {Promise<void>}
 */
export async function gracefulDatabaseShutdown(db) {
  try {
    console.log('🔄 Closing database connections...');
    await db.end();
    console.log('✅ Database connections closed successfully');
  } catch (error) {
    console.error('❌ Error closing database connections:', error);
    throw error;
  }
}
