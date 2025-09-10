#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const MONITORING_INTERVAL = 10000; // 10 seconds
const ALERT_THRESHOLDS = {
  responseTime: 500, // ms
  memoryUsage: 800,  // MB
  errorRate: 5       // %
};

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: 0,
      responses: 0,
      errors: 0,
      totalResponseTime: 0,
      lastCheck: Date.now()
    };
    
    this.alerts = [];
  }

  async checkHealth() {
    return new Promise((resolve) => {
      const start = Date.now();
      const req = http.get(`${SERVER_URL}/health`, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const responseTime = Date.now() - start;
          
          try {
            const health = JSON.parse(data);
            resolve({
              success: true,
              responseTime,
              health,
              status: res.statusCode
            });
          } catch (error) {
            resolve({
              success: false,
              responseTime,
              error: 'Invalid JSON response'
            });
          }
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          responseTime: Date.now() - start,
          error: error.message
        });
      });

      req.setTimeout(5000, () => {
        req.destroy();
        resolve({
          success: false,
          responseTime: Date.now() - start,
          error: 'Request timeout'
        });
      });
    });
  }

  async getMetrics() {
    return new Promise((resolve) => {
      const start = Date.now();
      const req = http.get(`${SERVER_URL}/api/metrics`, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const responseTime = Date.now() - start;
          
          try {
            const metrics = JSON.parse(data);
            resolve({
              success: true,
              responseTime,
              metrics: metrics.data,
              status: res.statusCode
            });
          } catch (error) {
            resolve({
              success: false,
              responseTime,
              error: 'Invalid JSON response'
            });
          }
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          responseTime: Date.now() - start,
          error: error.message
        });
      });

      req.setTimeout(5000, () => {
        req.destroy();
        resolve({
          success: false,
          responseTime: Date.now() - start,
          error: 'Request timeout'
        });
      });
    });
  }

  analyzePerformance(healthResult, metricsResult) {
    const alerts = [];
    const timestamp = new Date().toISOString();

    // Check response time
    if (healthResult.responseTime > ALERT_THRESHOLDS.responseTime) {
      alerts.push({
        type: 'SLOW_RESPONSE',
        message: `Health check took ${healthResult.responseTime}ms (threshold: ${ALERT_THRESHOLDS.responseTime}ms)`,
        severity: 'WARNING',
        timestamp
      });
    }

    // Check memory usage
    if (metricsResult.success && metricsResult.metrics.memory) {
      const memUsage = metricsResult.metrics.memory.heapUsed;
      if (memUsage > ALERT_THRESHOLDS.memoryUsage) {
        alerts.push({
          type: 'HIGH_MEMORY',
          message: `Memory usage at ${memUsage}MB (threshold: ${ALERT_THRESHOLDS.memoryUsage}MB)`,
          severity: 'CRITICAL',
          timestamp
        });
      }
    }

    // Check server availability
    if (!healthResult.success) {
      alerts.push({
        type: 'SERVER_DOWN',
        message: `Server unreachable: ${healthResult.error}`,
        severity: 'CRITICAL',
        timestamp
      });
    }

    return alerts;
  }

  displayStatus(healthResult, metricsResult, alerts) {
    console.clear();
    console.log('🚀 SVCE Bus Tracker - Performance Monitor');
    console.log('=' .repeat(60));
    console.log(`⏰ Last Check: ${new Date().toLocaleString()}\n`);

    // Server Status
    console.log('🖥️  SERVER STATUS:');
    if (healthResult.success) {
      console.log(`   ✅ Status: HEALTHY`);
      console.log(`   ⚡ Response Time: ${healthResult.responseTime}ms`);
      if (healthResult.health.uptime) {
        console.log(`   ⏱️  Uptime: ${healthResult.health.uptime}`);
      }
      if (healthResult.health.memory) {
        console.log(`   💾 Memory: ${healthResult.health.memory.heapUsed} / ${healthResult.health.memory.heapTotal}`);
      }
    } else {
      console.log(`   ❌ Status: DOWN`);
      console.log(`   🚨 Error: ${healthResult.error}`);
    }

    console.log('');

    // Performance Metrics
    if (metricsResult.success && metricsResult.metrics) {
      const m = metricsResult.metrics;
      console.log('📊 PERFORMANCE METRICS:');
      
      if (m.performance) {
        console.log(`   📈 Total Requests: ${m.performance.totalRequests.toLocaleString()}`);
        console.log(`   ⚡ Avg Response: ${m.performance.avgResponseTime}ms`);
        console.log(`   🔄 Requests/min: ${m.performance.requestsPerMinute}`);
      }
      
      if (m.memory) {
        const utilization = m.memory.heapUtilization || 0;
        const utilizationColor = utilization > 80 ? '🔴' : utilization > 60 ? '🟡' : '🟢';
        console.log(`   💾 Heap Used: ${m.memory.heapUsed}MB (${utilization}% ${utilizationColor})`);
        console.log(`   📊 RSS Memory: ${m.memory.rss}MB`);
      }
      
      if (m.server) {
        console.log(`   🏃 Worker: ${m.server.worker}`);
        console.log(`   🆔 PID: ${m.server.pid}`);
      }
    }

    console.log('');

    // Alerts
    if (alerts.length > 0) {
      console.log('🚨 ALERTS:');
      alerts.forEach(alert => {
        const icon = alert.severity === 'CRITICAL' ? '🔴' : '🟡';
        console.log(`   ${icon} ${alert.type}: ${alert.message}`);
      });
    } else {
      console.log('✅ NO ALERTS - All systems normal');
    }

    console.log('');
    console.log('=' .repeat(60));
    console.log('💡 Tips for 2000+ users:');
    console.log('   • Keep response time < 200ms');
    console.log('   • Keep memory usage < 800MB');
    console.log('   • Monitor cache hit rates');
    console.log('   • Watch for database connection pool exhaustion');
    console.log('');
    console.log('Press Ctrl+C to stop monitoring...');
  }

  async start() {
    console.log('🚀 Starting SVCE Bus Tracker Performance Monitor...');
    console.log(`📡 Monitoring: ${SERVER_URL}`);
    console.log(`⏱️  Interval: ${MONITORING_INTERVAL / 1000}s`);
    console.log('');

    const monitor = async () => {
      try {
        const [healthResult, metricsResult] = await Promise.all([
          this.checkHealth(),
          this.getMetrics()
        ]);

        const alerts = this.analyzePerformance(healthResult, metricsResult);
        this.displayStatus(healthResult, metricsResult, alerts);

        // Store alerts for trending
        this.alerts = [...alerts, ...this.alerts].slice(0, 10);

      } catch (error) {
        console.error('❌ Monitoring error:', error.message);
      }
    };

    // Initial check
    await monitor();

    // Set up interval
    const interval = setInterval(monitor, MONITORING_INTERVAL);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n👋 Stopping monitor...');
      clearInterval(interval);
      process.exit(0);
    });
  }
}

// Load testing function
async function runLoadTest(concurrent = 100, duration = 30) {
  console.log(`🧪 Running load test: ${concurrent} concurrent users for ${duration}s`);
  
  const results = {
    requests: 0,
    responses: 0,
    errors: 0,
    totalTime: 0
  };

  const startTime = Date.now();
  const endTime = startTime + (duration * 1000);

  const makeRequest = async () => {
    while (Date.now() < endTime) {
      const requestStart = Date.now();
      results.requests++;

      try {
        const response = await new Promise((resolve, reject) => {
          const req = http.get(`${SERVER_URL}/api/buses/active`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
          });
          req.on('error', reject);
          req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Timeout'));
          });
        });

        results.responses++;
        results.totalTime += Date.now() - requestStart;

      } catch (error) {
        results.errors++;
      }

      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  // Start concurrent requests
  const promises = Array(concurrent).fill().map(() => makeRequest());
  await Promise.all(promises);

  const avgResponseTime = results.responses > 0 ? results.totalTime / results.responses : 0;
  const errorRate = results.requests > 0 ? (results.errors / results.requests) * 100 : 0;
  const rps = results.responses / duration;

  console.log('\n📊 Load Test Results:');
  console.log(`   📈 Total Requests: ${results.requests}`);
  console.log(`   ✅ Successful: ${results.responses}`);
  console.log(`   ❌ Errors: ${results.errors} (${errorRate.toFixed(1)}%)`);
  console.log(`   ⚡ Avg Response Time: ${avgResponseTime.toFixed(0)}ms`);
  console.log(`   🔄 Requests/second: ${rps.toFixed(1)}`);

  return results;
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'test') {
    const concurrent = parseInt(args[1]) || 100;
    const duration = parseInt(args[2]) || 30;
    runLoadTest(concurrent, duration).then(() => process.exit(0));
  } else {
    const monitor = new PerformanceMonitor();
    monitor.start();
  }
}

module.exports = { PerformanceMonitor, runLoadTest };
