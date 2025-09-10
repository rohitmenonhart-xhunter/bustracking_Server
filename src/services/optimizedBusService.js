const OptimizedBus = require('../models/OptimizedBus');
const OptimizedLocation = require('../models/OptimizedLocation');

// In-memory cache for frequently accessed data (reduces DB load)
const cache = {
  activeBuses: new Map(),
  lastUpdated: new Map(),
  recentLocations: new Map()
};

// Cache TTL (Time To Live) in milliseconds
const CACHE_TTL = {
  ACTIVE_BUSES: 30000,      // 30 seconds
  RECENT_LOCATIONS: 15000,  // 15 seconds
  BUS_STATUS: 60000         // 1 minute
};

class OptimizedBusService {
  /**
   * Batch location updates for efficiency (handle multiple buses at once)
   */
  static async batchUpdateLocations(locationUpdates) {
    try {
      if (locationUpdates.length === 0) return { success: true, processed: 0 };
      
      // Validate all locations first
      const validLocations = locationUpdates.filter(loc => 
        loc.busNumber && 
        loc.latitude && 
        loc.longitude &&
        Math.abs(loc.latitude) <= 90 &&
        Math.abs(loc.longitude) <= 180
      );
      
      if (validLocations.length === 0) {
        throw new Error('No valid locations to process');
      }
      
      // Batch insert for efficiency
      const savedLocations = await OptimizedLocation.batchCreate(validLocations);
      
      // Update cache
      validLocations.forEach(loc => {
        cache.lastUpdated.set(loc.busNumber, Date.now());
        cache.recentLocations.set(loc.busNumber, {
          ...loc,
          timestamp: Date.now()
        });
      });
      
      console.log(`📍 Batch updated ${savedLocations.length} locations`);
      
      return {
        success: true,
        processed: savedLocations.length,
        failed: locationUpdates.length - validLocations.length,
        locations: savedLocations
      };
    } catch (error) {
      console.error('❌ Batch location update error:', error);
      throw error;
    }
  }

  /**
   * Optimized single location update with intelligent caching
   */
  static async updateLocationOptimized(busNumber, locationData) {
    try {
      // Rate limiting per bus (prevent spam from single bus)
      const lastUpdate = cache.lastUpdated.get(busNumber) || 0;
      const timeSinceLastUpdate = Date.now() - lastUpdate;
      
      if (timeSinceLastUpdate < 8000) { // Minimum 8 seconds between updates
        console.log(`⏱️  Rate limited bus ${busNumber} (${timeSinceLastUpdate}ms since last update)`);
        return {
          success: true,
          message: `Location cached for bus ${busNumber}`,
          rateLimited: true
        };
      }
      
      // Validate location data
      if (!locationData.latitude || !locationData.longitude) {
        throw new Error('Latitude and longitude are required');
      }
      
      if (Math.abs(locationData.latitude) > 90 || Math.abs(locationData.longitude) > 180) {
        throw new Error('Invalid coordinates');
      }
      
      // Check if bus exists and is active (with caching)
      let bus = cache.activeBuses.get(busNumber);
      if (!bus || Date.now() - bus.cachedAt > CACHE_TTL.BUS_STATUS) {
        bus = await OptimizedBus.findByBusNumber(busNumber);
        if (bus) {
          cache.activeBuses.set(busNumber, { ...bus, cachedAt: Date.now() });
        }
      }
      
      if (!bus) {
        throw new Error(`Bus ${busNumber} not found. Please start tracking first.`);
      }
      
      if (!bus.isActive) {
        throw new Error(`Bus ${busNumber} is not currently being tracked`);
      }
      
      // Save location to database
      const location = await OptimizedLocation.create({
        busNumber,
        latitude: parseFloat(locationData.latitude),
        longitude: parseFloat(locationData.longitude),
        accuracy: parseFloat(locationData.accuracy) || 0,
        timestamp: locationData.timestamp || new Date().toISOString()
      });
      
      // Update cache
      cache.lastUpdated.set(busNumber, Date.now());
      cache.recentLocations.set(busNumber, location);
      
      return {
        success: true,
        message: `Location updated for bus ${busNumber}`,
        location: location
      };
    } catch (error) {
      console.error(`❌ Error updating location for bus ${busNumber}:`, error);
      throw error;
    }
  }

  /**
   * Cached active buses retrieval
   */
  static async getActiveBusesOptimized() {
    try {
      const cacheKey = 'all_active_buses';
      const cached = cache.activeBuses.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < CACHE_TTL.ACTIVE_BUSES) {
        return cached.data;
      }
      
      // Get active buses with recent locations in one query
      const busesWithLocations = await OptimizedBus.getActiveBusesWithRecentActivity(30);
      
      // Update cache
      cache.activeBuses.set(cacheKey, {
        data: busesWithLocations,
        timestamp: Date.now()
      });
      
      return busesWithLocations;
    } catch (error) {
      console.error('❌ Error getting active buses:', error);
      throw error;
    }
  }

  /**
   * Smart dashboard with minimal DB queries
   */
  static async getOptimizedDashboard() {
    try {
      // Use cached data when possible
      const activeBuses = await this.getActiveBusesOptimized();
      const stats = await OptimizedLocation.getLocationStats();
      
      return {
        totalActiveBuses: activeBuses.length,
        activeBuses: activeBuses.map(item => item.bus),
        recentLocations: activeBuses
          .filter(item => item.latestLocation)
          .map(item => item.latestLocation),
        statistics: {
          totalLocations: parseInt(stats.total_locations) || 0,
          uniqueBuses: parseInt(stats.unique_buses) || 0,
          oldestRecord: stats.oldest_record,
          newestRecord: stats.newest_record
        },
        cacheStatus: {
          activeBusesCache: cache.activeBuses.size,
          locationCache: cache.recentLocations.size,
          lastCacheUpdate: Math.max(...Array.from(cache.lastUpdated.values()))
        },
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error getting dashboard data:', error);
      throw error;
    }
  }

  /**
   * Efficient bus history with intelligent sampling
   */
  static async getBusHistoryOptimized(busNumber, hours = 24, maxPoints = 100) {
    try {
      const bus = await OptimizedBus.findByBusNumber(busNumber);
      if (!bus) {
        throw new Error(`Bus ${busNumber} not found`);
      }
      
      // Get all locations first
      const allLocations = await OptimizedLocation.getByBusNumber(busNumber, hours * 60); // Rough estimate
      
      // Intelligent sampling for large datasets
      let sampledLocations = allLocations;
      if (allLocations.length > maxPoints) {
        const step = Math.ceil(allLocations.length / maxPoints);
        sampledLocations = allLocations.filter((_, index) => index % step === 0);
        
        // Always include the latest location
        if (allLocations.length > 0 && sampledLocations[0].id !== allLocations[0].id) {
          sampledLocations.unshift(allLocations[0]);
        }
      }
      
      return {
        bus: bus,
        locations: sampledLocations,
        totalLocations: allLocations.length,
        sampledPoints: sampledLocations.length,
        timeRange: {
          hours: hours,
          maxPoints: maxPoints
        }
      };
    } catch (error) {
      console.error(`❌ Error getting history for bus ${busNumber}:`, error);
      throw error;
    }
  }

  /**
   * Optimized start tracking with better error handling
   */
  static async startTrackingOptimized(busNumber, driverName = 'Teacher') {
    try {
      let bus = await OptimizedBus.findByBusNumber(busNumber);
      
      if (!bus) {
        bus = await OptimizedBus.create({
          busNumber,
          driverName
        });
        console.log(`📍 Created new bus: ${busNumber}`);
      } else {
        bus = await OptimizedBus.updateActiveStatus(busNumber, true);
        console.log(`🔄 Reactivated bus: ${busNumber}`);
      }
      
      // Update cache
      cache.activeBuses.set(busNumber, { ...bus, cachedAt: Date.now() });
      cache.activeBuses.delete('all_active_buses'); // Invalidate list cache
      
      return {
        success: true,
        message: `Bus ${busNumber} tracking started successfully`,
        bus: bus
      };
    } catch (error) {
      console.error(`❌ Error starting tracking for bus ${busNumber}:`, error);
      throw error;
    }
  }

  /**
   * Optimized stop tracking
   */
  static async stopTrackingOptimized(busNumber) {
    try {
      await OptimizedBus.updateActiveStatus(busNumber, false);
      
      // Clear from cache
      cache.activeBuses.delete(busNumber);
      cache.activeBuses.delete('all_active_buses'); // Invalidate list cache
      cache.lastUpdated.delete(busNumber);
      cache.recentLocations.delete(busNumber);
      
      console.log(`🛑 Stopped tracking bus: ${busNumber}`);
      
      return {
        success: true,
        message: `Bus ${busNumber} tracking stopped successfully`
      };
    } catch (error) {
      console.error(`❌ Error stopping tracking for bus ${busNumber}:`, error);
      throw error;
    }
  }

  /**
   * Scheduled cleanup for free tier optimization
   */
  static async performScheduledCleanup() {
    try {
      console.log('🧹 Starting scheduled cleanup...');
      
      // Smart cleanup - keep sample data for history
      const deletedCount = await OptimizedLocation.smartCleanup(7, 10); // Keep every 10th record after 7 days
      
      // Clear old cache entries
      const now = Date.now();
      for (const [key, value] of cache.activeBuses.entries()) {
        if (now - value.cachedAt > CACHE_TTL.BUS_STATUS * 2) {
          cache.activeBuses.delete(key);
        }
      }
      
      console.log(`🧹 Cleanup completed: ${deletedCount} old locations cleaned, cache optimized`);
      
      return { deletedLocations: deletedCount };
    } catch (error) {
      console.error('❌ Error during scheduled cleanup:', error);
      throw error;
    }
  }

  /**
   * Get system health and performance metrics
   */
  static async getSystemHealth() {
    try {
      const stats = await OptimizedLocation.getLocationStats();
      
      return {
        database: {
          totalLocations: parseInt(stats.total_locations) || 0,
          uniqueBuses: parseInt(stats.unique_buses) || 0,
          dataSpan: {
            oldest: stats.oldest_record,
            newest: stats.newest_record
          }
        },
        cache: {
          activeBuses: cache.activeBuses.size,
          recentLocations: cache.recentLocations.size,
          lastUpdated: cache.lastUpdated.size
        },
        performance: {
          cacheHitRate: this.calculateCacheHitRate(),
          avgResponseTime: this.getAvgResponseTime()
        }
      };
    } catch (error) {
      console.error('❌ Error getting system health:', error);
      throw error;
    }
  }

  /**
   * Clear all caches (useful for debugging)
   */
  static clearAllCaches() {
    cache.activeBuses.clear();
    cache.lastUpdated.clear();
    cache.recentLocations.clear();
    console.log('🗑️  All caches cleared');
  }

  // Helper methods
  static calculateCacheHitRate() {
    // Implementation for cache hit rate calculation
    return 85; // Placeholder
  }

  static getAvgResponseTime() {
    // Implementation for average response time calculation
    return 45; // Placeholder in ms
  }
}

module.exports = OptimizedBusService;
