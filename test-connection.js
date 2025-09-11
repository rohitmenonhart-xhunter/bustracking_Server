#!/usr/bin/env node

/**
 * Database Connection Test Script
 * 
 * This script helps debug database connectivity issues in deployment environments.
 * It tests different connection methods and provides detailed logging.
 */

require('dotenv').config();
const { Pool } = require('pg');

console.log('🔍 Database Connection Test Starting...\n');

// Test 1: Environment Variables
console.log('1️⃣  Testing Environment Variables:');
console.log('- DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('- DATABASE_URL format:', process.env.DATABASE_URL ? 'postgresql://...' : 'MISSING');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'undefined');
console.log('- Node.js version:', process.version);
console.log('- Platform:', process.platform);
console.log('- Architecture:', process.arch);
console.log('');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Please check your environment variables.');
  process.exit(1);
}

// Test 2: IPv4 Forced Connection (Primary Method)
async function testIPv4Connection() {
  console.log('2️⃣  Testing IPv4 Forced Connection (Primary Method):');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    min: 1,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 20000,
    statement_timeout: 20000,
    query_timeout: 18000,
    application_name: 'connection_test_ipv4',
    family: 4, // Force IPv4
    keepAlive: false,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('- Attempting connection...');
    const client = await pool.connect();
    console.log('✅ IPv4 connection successful');
    
    const result = await client.query('SELECT NOW() as current_time, version() as db_version');
    console.log('- Database time:', result.rows[0].current_time);
    console.log('- Database version:', result.rows[0].db_version.split(' ')[0]);
    
    client.release();
    await pool.end();
    
    return true;
  } catch (error) {
    console.log('❌ IPv4 connection failed:', error.message);
    try { await pool.end(); } catch (e) { /* ignore */ }
    return false;
  }
}

// Test 3: System Default Connection (Fallback Method)
async function testSystemDefaultConnection() {
  console.log('\n3️⃣  Testing System Default Connection (Fallback Method):');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    min: 1,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 60000,
    acquireTimeoutMillis: 30000,
    statement_timeout: 30000,
    query_timeout: 25000,
    application_name: 'connection_test_default',
    // No family specified - let system decide
    keepAlive: true,
    keepAliveInitialDelayMillis: 30000,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('- Attempting connection...');
    const client = await pool.connect();
    console.log('✅ System default connection successful');
    
    const result = await client.query('SELECT NOW() as current_time');
    console.log('- Database time:', result.rows[0].current_time);
    
    client.release();
    await pool.end();
    
    return true;
  } catch (error) {
    console.log('❌ System default connection failed:', error.message);
    try { await pool.end(); } catch (e) { /* ignore */ }
    return false;
  }
}

// Test 4: Minimal Connection
async function testMinimalConnection() {
  console.log('\n4️⃣  Testing Minimal Connection (Basic Settings):');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: false // Try without SSL first
  });

  try {
    console.log('- Attempting connection without SSL...');
    const client = await pool.connect();
    console.log('✅ Minimal connection (no SSL) successful');
    
    client.release();
    await pool.end();
    return true;
  } catch (error) {
    console.log('❌ Minimal connection (no SSL) failed:', error.message);
    try { await pool.end(); } catch (e) { /* ignore */ }
    
    // Try with SSL
    const poolWithSSL = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      ssl: { rejectUnauthorized: false }
    });

    try {
      console.log('- Attempting connection with SSL...');
      const client = await poolWithSSL.connect();
      console.log('✅ Minimal connection (with SSL) successful');
      
      client.release();
      await poolWithSSL.end();
      return true;
    } catch (sslError) {
      console.log('❌ Minimal connection (with SSL) failed:', sslError.message);
      try { await poolWithSSL.end(); } catch (e) { /* ignore */ }
      return false;
    }
  }
}

// Run all tests
async function runTests() {
  try {
    const ipv4Success = await testIPv4Connection();
    const defaultSuccess = await testSystemDefaultConnection();
    const minimalSuccess = await testMinimalConnection();
    
    console.log('\n📊 Test Results Summary:');
    console.log('- IPv4 Forced Connection:', ipv4Success ? '✅ PASS' : '❌ FAIL');
    console.log('- System Default Connection:', defaultSuccess ? '✅ PASS' : '❌ FAIL');
    console.log('- Minimal Connection:', minimalSuccess ? '✅ PASS' : '❌ FAIL');
    
    if (ipv4Success) {
      console.log('\n🎉 SUCCESS: IPv4 forced connection works! This should fix your deployment issue.');
      console.log('💡 Recommendation: Use the IPv4 forced configuration in production.');
    } else if (defaultSuccess) {
      console.log('\n⚠️  WARNING: IPv4 forced connection failed, but system default works.');
      console.log('💡 Recommendation: Use the fallback configuration in production.');
    } else if (minimalSuccess) {
      console.log('\n⚠️  WARNING: Only minimal connection works. Check your network/SSL configuration.');
      console.log('💡 Recommendation: Review your deployment environment network settings.');
    } else {
      console.log('\n❌ ERROR: All connection methods failed.');
      console.log('💡 Recommendations:');
      console.log('  - Check if DATABASE_URL is correct');
      console.log('  - Verify network connectivity to Supabase');
      console.log('  - Check if your deployment platform blocks database connections');
      console.log('  - Try connecting from a different network');
    }
    
  } catch (error) {
    console.error('\n💥 Test script error:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Test terminated');
  process.exit(0);
});

// Run the tests
runTests().catch((error) => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
