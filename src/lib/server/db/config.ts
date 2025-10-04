import { DATABASE_URL } from '$env/static/private';
import postgres, { type Options } from 'postgres';

/**
 * Database configuration based on environment
 */
export function getDatabaseConfig(): Options<{}> {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';

  const baseConfig: Options<{}> = {
    // Connection pooling
    max: isProduction ? 20 : 10,           // Maximum connections in pool
    idle_timeout: isProduction ? 30 : 20,  // Close idle connections (seconds)
    connect_timeout: 10,                   // Connection timeout (seconds)
    
    // Transform undefined to null for PostgreSQL compatibility
    transform: {
      undefined: null
    },
    
    // Suppress notices in production for cleaner logs
    onnotice: isProduction ? () => {} : undefined,
    
    // Connection lifecycle management
    connection: {
      application_name: 'expositor-app',
      statement_timeout: 30000,  // 30 seconds
      idle_in_transaction_session_timeout: 60000  // 1 minute
    }
  };

  // Production-specific configurations
  if (isProduction) {
    return {
      ...baseConfig,
      ssl: 'require',
      // Additional production optimizations
      prepare: false,  // Disable prepared statements for connection pooling
      types: {
        bigint: postgres.BigInt
      }
    };
  }

  // Development-specific configurations
  if (isDevelopment) {
    return {
      ...baseConfig,
      ssl: false,
      // Enable debugging in development
      debug: (connection, query, parameters) => {
        console.log('🔍 DB Query:', query);
        if (parameters?.length) {
          console.log('📋 Parameters:', parameters);
        }
      }
    };
  }

  // Default configuration
  return baseConfig;
}

/**
 * Validate database URL format
 */
export function validateDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

/**
 * Get database connection info for logging (without sensitive data)
 */
export function getDatabaseInfo() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  if (!validateDatabaseUrl(DATABASE_URL)) {
    throw new Error('Invalid DATABASE_URL format');
  }

  try {
    const url = new URL(DATABASE_URL);
    return {
      host: url.hostname,
      port: url.port || '5432',
      database: url.pathname.slice(1),
      ssl: process.env.NODE_ENV === 'production'
    };
  } catch (error) {
    throw new Error(`Failed to parse DATABASE_URL: ${error}`);
  }
}
