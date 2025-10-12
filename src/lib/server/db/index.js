import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { DATABASE_URL } from '$env/static/private';
import { getDatabaseConfig, getDatabaseInfo } from './config.js';
import { logDatabaseConnection, checkDatabaseReadiness } from './health.js';

// Validate and get database configuration
const dbConfig = getDatabaseConfig();
const dbInfo = getDatabaseInfo();

// Create postgres client with enhanced configuration
const client = postgres(DATABASE_URL, dbConfig);

// Create Drizzle instance
export const db = drizzle(client, { schema });

// Log connection info on startup
logDatabaseConnection(dbInfo);

// Perform initial readiness check
checkDatabaseReadiness(client)
  .then((isReady) => {
    if (isReady) {
      console.log('✅ Database is ready for connections');
    } else {
      console.warn('⚠️  Database readiness check failed - some features may not work');
    }
  })
  .catch((error) => {
    console.error('❌ Database readiness check error:', error);
  });

// Export client for health checks and direct access if needed
export { client };

// Graceful shutdown handling
if (typeof process !== 'undefined') {
  const gracefulShutdown = async () => {
    try {
      console.log('🔄 Shutting down database connections...');
      await client.end();
      console.log('✅ Database connections closed successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during database shutdown:', error);
      process.exit(1);
    }
  };

  // Handle various shutdown signals
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGUSR2', gracefulShutdown); // For nodemon
}
