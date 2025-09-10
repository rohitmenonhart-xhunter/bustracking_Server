const cluster = require('cluster');
const os = require('os');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const cron = require('node-cron');
require('dotenv').config();

const { connectDatabase, checkHealth } = require('./config/optimizedDatabase');
const OptimizedBusService = require('./services/optimizedBusService');

// Determine number of workers (limit for free tier)
const numWorkers = Math.min(os.cpus().length, 2); // Max 2 workers for free tier

if (cluster.isMaster) {
  console.log(`🚀 Master process ${process.pid} starting...`);
  console.log(`📊 Starting ${numWorkers} worker processes for optimal performance`);

  // Fork workers
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  // Handle worker crashes
  cluster.on('exit', (worker, code, signal) => {
    console.log(`💀 Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Master received SIGTERM, shutting down workers...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
  });

} else {
  // Worker process
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Trust proxy for proper IP detection
  app.set('trust proxy', 1);

  // Advanced rate limiting for thousands of users
  const createRateLimit = (windowMs, max, message, skipSuccessfulRequests = false) => {
    return rateLimit({
      windowMs,
      max,
      message: { success: false, message },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests
      // Remove custom keyGenerator to fix IPv6 issue
    });
  };

  // Progressive rate limiting
  const generalLimiter = createRateLimit(
    1 * 60 * 1000,  // 1 minute
    30,             // 30 requests per minute per IP
    'Too many requests from this IP, please try again later.'
  );

  const locationLimiter = createRateLimit(
    1 * 60 * 1000,  // 1 minute
    12,             // 12 location updates per minute per bus (every 5 seconds)
    'Location updates too frequent. Please wait.',
    true
  );

  const authLimiter = createRateLimit(
    15 * 60 * 1000, // 15 minutes
    10,             // 10 auth attempts per 15 minutes
    'Too many authentication attempts, please try again later.'
  );

  // Slow down repeated requests (fixed for express-slow-down v2)
  const speedLimiter = slowDown({
    windowMs: 1 * 60 * 1000, // 1 minute
    delayAfter: 10,          // Allow 10 requests per minute at full speed
    delayMs: () => 100,      // Fixed for v2: function that returns delay
    validate: { delayMs: false } // Disable warning
  });

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for API
    crossOriginEmbedderPolicy: false
  }));
  
  // Enhanced compression with better filtering
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      
      // Don't compress images, videos, or already compressed data
      const contentType = res.getHeader('Content-Type');
      if (contentType && (
        contentType.includes('image/') ||
        contentType.includes('video/') ||
        contentType.includes('application/zip') ||
        contentType.includes('application/gzip')
      )) {
        return false;
      }
      
      return compression.filter(req, res);
    },
    threshold: 512,     // Compress anything > 512 bytes
    level: 6,           // Good balance of speed vs compression
    memLevel: 8,        // Higher memory for better compression
    chunkSize: 16 * 1024 // 16KB chunks for better streaming
  }));

  // CORS configuration for mobile app
  app.use(cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      // Allow localhost and your IP
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:8080',
        'http://192.168.29.250:3000',
        /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+$/
      ];
      
      const isAllowed = allowedOrigins.some(pattern => {
        if (typeof pattern === 'string') return pattern === origin;
        return pattern.test(origin);
      });
      
      callback(null, isAllowed);
    },
    credentials: true,
    optionsSuccessStatus: 200
  }));

  // Body parsing with limits
  app.use(express.json({ 
    limit: '1mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));
  
  app.use(express.urlencoded({ 
    extended: true, 
    limit: '1mb' 
  }));
  
  // Performance monitoring middleware
  let requestCount = 0;
  let totalResponseTime = 0;
  const startTime = Date.now();
  
  app.use((req, res, next) => {
    const requestStart = Date.now();
    requestCount++;
    
    // Monitor memory usage for high-traffic endpoints
    if (req.path.includes('/active') || req.path.includes('/location')) {
      const memUsage = process.memoryUsage();
      req.memorySnapshot = {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024) // MB
      };
    }
    
    // Override end to capture response time
    const originalEnd = res.end;
    res.end = function(...args) {
      const responseTime = Date.now() - requestStart;
      totalResponseTime += responseTime;
      
      // Log slow requests (>500ms)
      if (responseTime > 500) {
        console.log(`⚠️ SLOW REQUEST: ${req.method} ${req.path} - ${responseTime}ms`);
        if (req.memorySnapshot) {
          console.log(`   Memory: ${req.memorySnapshot.heapUsed}MB heap used`);
        }
      }
      
      // Log memory warnings (>800MB heap)
      if (req.memorySnapshot && req.memorySnapshot.heapUsed > 800) {
        console.log(`🚨 HIGH MEMORY: ${req.memorySnapshot.heapUsed}MB heap used on ${req.path}`);
      }
      
      // Set performance headers
      res.setHeader('X-Response-Time', `${responseTime}ms`);
      res.setHeader('X-Request-ID', requestCount);
      
      originalEnd.apply(this, args);
    };
    
    next();
  });

  // Enhanced logging
  const morganFormat = process.env.NODE_ENV === 'production' 
    ? 'combined' 
    : ':method :url :status :res[content-length] - :response-time ms [:date[clf]]';
    
  app.use(morgan(morganFormat, {
    skip: (req, res) => req.path === '/health' && res.statusCode === 200
  }));

  // Apply rate limiting
  app.use('/api/', speedLimiter);
  app.use('/api/', generalLimiter);
  app.use('/api/buses/start-tracking', authLimiter);
  app.use('/api/buses/stop-tracking', authLimiter);
  app.use('/api/buses/:busNumber/location', locationLimiter);

  // Health check endpoint (detailed for monitoring)
  app.get('/health', async (req, res) => {
    try {
      const dbHealth = await checkHealth();
      const systemHealth = await OptimizedBusService.getSystemHealth();
      
      res.status(200).json({
        status: 'OK',
        message: 'SVCE Bus Tracker API is running optimally',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        worker: process.pid,
        database: dbHealth,
        system: systemHealth,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        }
      });
    } catch (error) {
      res.status(503).json({
        status: 'ERROR',
        message: 'Health check failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Optimized API routes
  const optimizedBusRoutes = require('./routes/optimizedBusRoutes');
  app.use('/api/buses', optimizedBusRoutes);

  // Enhanced health check endpoint
  app.get('/health', (req, res) => {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    
    res.json({
      status: 'healthy',
      uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      },
      pid: process.pid,
      timestamp: new Date().toISOString()
    });
  });
  
  // Performance metrics endpoint
  app.get('/api/metrics', (req, res) => {
    const uptime = process.uptime();
    const avgResponseTime = requestCount > 0 ? (totalResponseTime / requestCount) : 0;
    const memUsage = process.memoryUsage();
    
    res.json({
      success: true,
      data: {
        server: {
          uptime: Math.floor(uptime),
          uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
          pid: process.pid,
          worker: cluster.worker ? cluster.worker.id : 'master'
        },
        performance: {
          totalRequests: requestCount,
          avgResponseTime: Math.round(avgResponseTime),
          requestsPerMinute: requestCount > 0 ? Math.round((requestCount / uptime) * 60) : 0
        },
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapUtilization: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
        }
      },
      timestamp: new Date().toISOString()
    });
  });

  // System monitoring endpoint
  app.get('/api/system/stats', async (req, res) => {
    try {
      const stats = await OptimizedBusService.getSystemHealth();
      const uptime = process.uptime();
      const memUsage = process.memoryUsage();
      
      res.json({
        success: true,
        data: {
          ...stats,
          server: {
            uptime: Math.floor(uptime),
            memory: {
              heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
              heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
            },
            performance: {
              totalRequests: requestCount,
              avgResponseTime: requestCount > 0 ? Math.round(totalResponseTime / requestCount) : 0
            }
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get system stats',
        error: error.message
      });
    }
  });

  // Graceful error handling
  const { errorHandler, notFound } = require('./middleware/errorMiddleware');
  app.use(notFound);
  app.use(errorHandler);

  // Initialize database and start server
  const startOptimizedServer = async () => {
    try {
      // Connect to database
      await connectDatabase();
      console.log(`✅ Worker ${process.pid}: Database connected`);
      
      // Start HTTP server
      const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Worker ${process.pid}: SVCE Bus Tracker API running on port ${PORT}`);
        console.log(`📡 Available on network: http://192.168.29.250:${PORT}`);
        console.log(`🔗 API Base URL: http://192.168.29.250:${PORT}/api`);
        console.log(`❤️  Health check: http://192.168.29.250:${PORT}/health`);
      });

      // Optimize server settings
      server.keepAliveTimeout = 65000;
      server.headersTimeout = 66000;
      server.maxConnections = 1000; // Limit connections for free tier

      // Graceful shutdown
      const shutdown = async (signal) => {
        console.log(`🛑 Worker ${process.pid} received ${signal}, shutting down gracefully...`);
        
        server.close(async () => {
          console.log(`✅ Worker ${process.pid}: HTTP server closed`);
          
          // Close database connections
          const { closeDatabase } = require('./config/optimizedDatabase');
          await closeDatabase();
          
          process.exit(0);
        });
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
      
    } catch (error) {
      console.error(`❌ Worker ${process.pid} failed to start:`, error);
      process.exit(1);
    }
  };

  // Schedule cleanup tasks (only run on one worker)
  if (cluster.worker.id === 1) {
    // Clean up old data every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      try {
        console.log('🧹 Starting scheduled cleanup...');
        await OptimizedBusService.performScheduledCleanup();
      } catch (error) {
        console.error('❌ Scheduled cleanup failed:', error);
      }
    });

    // Clear cache every hour to prevent memory leaks
    cron.schedule('0 * * * *', () => {
      console.log('🗑️  Clearing caches...');
      OptimizedBusService.clearAllCaches();
    });

    // Performance monitoring task (every 5 minutes)
    cron.schedule('*/5 * * * *', () => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const uptime = process.uptime();
      const avgResponseTime = requestCount > 0 ? Math.round(totalResponseTime / requestCount) : 0;
      
      console.log(`📊 Performance Check: Heap=${heapUsedMB}MB, Uptime=${Math.floor(uptime/60)}m, AvgResponse=${avgResponseTime}ms, Requests=${requestCount}`);
      
      // Alert if memory usage is high
      if (heapUsedMB > 800) {
        console.log(`🚨 HIGH MEMORY ALERT: ${heapUsedMB}MB heap usage detected`);
      }
      
      // Alert if average response time is slow
      if (avgResponseTime > 200) {
        console.log(`⚠️ SLOW RESPONSE ALERT: ${avgResponseTime}ms average response time`);
      }
    });

    console.log('⏰ Scheduled tasks initialized on worker 1');
  }

  // Start the server
  startOptimizedServer();
}
