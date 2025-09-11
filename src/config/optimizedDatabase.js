const { Pool } = require('pg');

// Direct PostgreSQL connection with connection pooling for thousands of users
let pool = null;

const createOptimizedPool = () => {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    // Enhanced for 2000+ concurrent users while respecting free tier limits
    max: 15, // Increased from 10 to 15 (still under typical 25 limit)
    min: 3,  // Keep 3 connections always open for immediate response
    idle: 30000, // Keep connections alive longer (30 seconds)
    connectionTimeoutMillis: 15000, // Extended for deployment environments
    idleTimeoutMillis: 30000, // Match idle setting
    acquireTimeoutMillis: 20000, // Extended for peak loads and slow networks
    
    // Optimization for high traffic
    statement_timeout: 20000, // Increased to 20 seconds for complex queries
    query_timeout: 18000, // 18 seconds for query execution
    application_name: 'svce_bus_tracker_optimized',
    
    // IPv6 fix: Force IPv4 connection to avoid deployment platform IPv6 issues
    family: 4, // Force IPv4 (fixes IPv6 connectivity issues on many platforms)
    
    // Network stability settings for deployment environments
    keepAlive: false, // Disable for problematic networks
    keepAliveInitialDelayMillis: 0,
    
    // SSL configuration for Supabase
    ssl: {
      rejectUnauthorized: false
    }
  });
};

const connectDatabase = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Try primary connection first
  try {
    console.log('🔄 Attempting primary database connection (IPv4 forced)...');
    pool = createOptimizedPool();
    
    // Test the connection with timeout
    const client = await pool.connect();
    console.log('✅ Direct PostgreSQL connection established');
    
    // Test query
    const result = await client.query('SELECT NOW() as current_time');
    console.log(`📅 Database time: ${result.rows[0].current_time}`);
    
    client.release();
    
    // Setup connection monitoring
    pool.on('connect', () => {
      console.log('🔗 New database connection established');
    });
    
    pool.on('error', (err) => {
      console.error('❌ Database connection error:', err);
    });
    
    return pool;
  } catch (primaryError) {
    console.warn('⚠️  Primary connection failed:', primaryError.message);
    
    // Close failed pool
    if (pool) {
      try { await pool.end(); } catch (e) { /* ignore */ }
      pool = null;
    }
    
    // Try fallback connection with different settings
    try {
      console.log('🔄 Attempting fallback database connection...');
      
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        min: 2,
        connectionTimeoutMillis: 30000, // Very long timeout for slow networks
        idleTimeoutMillis: 60000,
        acquireTimeoutMillis: 30000,
        statement_timeout: 30000,
        query_timeout: 25000,
        application_name: 'svce_bus_tracker_fallback',
        
        // Try without forcing IPv4 (let system decide)
        // family: undefined,
        
        // More permissive network settings
        keepAlive: true,
        keepAliveInitialDelayMillis: 30000,
        
        ssl: {
          rejectUnauthorized: false
        }
      });
      
      const client = await pool.connect();
      console.log('✅ Fallback PostgreSQL connection established');
      
      const result = await client.query('SELECT NOW() as current_time');
      console.log(`📅 Database time (fallback): ${result.rows[0].current_time}`);
      
      client.release();
      
      pool.on('connect', () => {
        console.log('🔗 New database connection established (fallback)');
      });
      
      pool.on('error', (err) => {
        console.error('❌ Database connection error (fallback):', err);
      });
      
      return pool;
    } catch (fallbackError) {
      console.error('❌ Both primary and fallback connections failed');
      console.error('Primary error:', primaryError.message);
      console.error('Fallback error:', fallbackError.message);
      
      // Provide helpful debugging info
      console.error('🔍 Connection debugging info:');
      console.error('- DATABASE_URL exists:', !!process.env.DATABASE_URL);
      console.error('- DATABASE_URL starts with postgresql://', process.env.DATABASE_URL?.startsWith('postgresql://'));
      console.error('- Node.js version:', process.version);
      console.error('- Platform:', process.platform);
      
      throw new Error(`Database connection failed. Primary: ${primaryError.message}. Fallback: ${fallbackError.message}`);
    }
  }
};

const getPool = () => {
  if (!pool) {
    throw new Error('Database not initialized. Call connectDatabase() first.');
  }
  return pool;
};

// Optimized query function with retry logic
const executeQuery = async (text, params = [], retries = 2) => {
  const client = await getPool().connect();
  
  try {
    const start = Date.now();
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries (> 100ms)
    if (duration > 100) {
      console.warn(`⚠️  Slow query (${duration}ms): ${text.substring(0, 50)}...`);
    }
    
    return result;
  } catch (error) {
    if (retries > 0 && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
      console.log(`🔄 Retrying query, ${retries} attempts left`);
      await new Promise(resolve => setTimeout(resolve, 100));
      return executeQuery(text, params, retries - 1);
    }
    throw error;
  } finally {
    client.release();
  }
};

// Batch insert for bulk operations (more efficient for multiple locations)
const executeBatchInsert = async (table, columns, values) => {
  if (values.length === 0) return { rowCount: 0 };
  
  const placeholders = values.map((_, i) => 
    `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`
  ).join(', ');
  
  const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} RETURNING *`;
  const flatValues = values.flat();
  
  return executeQuery(query, flatValues);
};

// Graceful shutdown
const closeDatabase = async () => {
  if (pool) {
    console.log('🔌 Closing database connections...');
    await pool.end();
    pool = null;
    console.log('✅ Database connections closed');
  }
};

// Connection health check
const checkHealth = async () => {
  try {
    const result = await executeQuery('SELECT 1 as health_check');
    return {
      healthy: true,
      connectionCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
};

module.exports = {
  connectDatabase,
  getPool,
  executeQuery,
  executeBatchInsert,
  closeDatabase,
  checkHealth
};
