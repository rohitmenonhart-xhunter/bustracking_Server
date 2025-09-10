const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const OptimizedBusService = require('../services/optimizedBusService');
const {
  validateStartTracking,
  validateStopTracking,
  validateUpdateLocation,
  validateGetHistory
} = require('../middleware/validation');

// Optimized controllers for high-traffic scenarios
class OptimizedBusController {
  /**
   * Start tracking with optimized response
   */
  static async startTracking(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { busNumber, driverName } = req.body;
      const result = await OptimizedBusService.startTrackingOptimized(busNumber, driverName);
      
      // Fix response format for Android app
      res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.bus  // Android expects 'data' field, not 'bus'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Stop tracking with cache cleanup
   */
  static async stopTracking(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { busNumber } = req.body;
      const result = await OptimizedBusService.stopTrackingOptimized(busNumber);
      
      // Fix response format for Android app
      res.status(200).json({
        success: result.success,
        message: result.message,
        data: null  // Stop tracking doesn't need data
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * High-performance location update with intelligent rate limiting
   */
  static async updateLocation(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { busNumber } = req.params;
      const locationData = req.body;
      
      const result = await OptimizedBusService.updateLocationOptimized(busNumber, locationData);
      
      // Send minimal response for efficiency with correct format
      res.status(200).json({
        success: result.success,
        message: result.message,
        data: {
          rateLimited: result.rateLimited || false,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Batch location updates for multiple buses (efficiency optimization)
   */
  static async batchUpdateLocations(req, res, next) {
    try {
      const { locations } = req.body;
      
      if (!Array.isArray(locations) || locations.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Locations array is required and must not be empty'
        });
      }

      if (locations.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 50 locations per batch request'
        });
      }

      const result = await OptimizedBusService.batchUpdateLocations(locations);
      
      res.status(200).json({
        success: true,
        message: `Batch processed ${result.processed} locations`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get active buses with intelligent caching
   */
  static async getActiveBuses(req, res, next) {
    try {
      const result = await OptimizedBusService.getActiveBusesOptimized();
      
      // Enhanced cache headers for maximum efficiency
      const etag = `"${Buffer.from(JSON.stringify(result)).toString('base64').slice(0, 16)}"`;
      
      res.set({
        'Cache-Control': 'public, max-age=30, s-maxage=30, must-revalidate', // 30s cache with validation
        'ETag': etag,
        'Last-Modified': new Date().toUTCString(),
        'Vary': 'Accept-Encoding', // For compression
        'X-Cache-TTL': '30',
        'X-Data-Source': 'optimized-cache'
      });
      
      // Check if client has cached version
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end(); // Not Modified
      }
      
      res.status(200).json({
        success: true,
        message: 'Active buses retrieved successfully',
        data: result,
        count: result.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Optimized dashboard with performance metrics
   */
  static async getDashboard(req, res, next) {
    try {
      const result = await OptimizedBusService.getOptimizedDashboard();
      
      // Cache dashboard data for 1 minute
      res.set({
        'Cache-Control': 'public, max-age=60',
        'ETag': `"dashboard-${Date.now()}"`,
      });
      
      res.status(200).json({
        success: true,
        message: 'Dashboard data retrieved successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Optimized bus history with intelligent sampling
   */
  static async getBusHistory(req, res, next) {
    try {
      const { busNumber } = req.params;
      const { hours = 24, maxPoints = 100 } = req.query;
      
      const result = await OptimizedBusService.getBusHistoryOptimized(
        busNumber, 
        parseInt(hours), 
        parseInt(maxPoints)
      );
      
      // Cache history data for 5 minutes
      res.set({
        'Cache-Control': 'public, max-age=300',
        'ETag': `"history-${busNumber}-${Date.now()}"`,
      });
      
      res.status(200).json({
        success: true,
        message: `History for bus ${busNumber} retrieved successfully`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Real-time location stream endpoint (future WebSocket upgrade)
   */
  static async getLocationStream(req, res, next) {
    try {
      const { busNumber } = req.params;
      
      // Get latest location with minimal data
      const OptimizedLocation = require('../models/OptimizedLocation');
      const latestLocation = await OptimizedLocation.getLatestByBusNumber(busNumber);
      
      if (!latestLocation) {
        return res.status(404).json({
          success: false,
          message: `No location data found for bus ${busNumber}`
        });
      }
      
      // Minimal response for real-time updates
      res.status(200).json({
        success: true,
        busNumber: busNumber,
        location: {
          lat: latestLocation.latitude,
          lng: latestLocation.longitude,
          accuracy: latestLocation.accuracy,
          timestamp: latestLocation.timestamp
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * System health and metrics
   */
  static async getSystemMetrics(req, res, next) {
    try {
      const health = await OptimizedBusService.getSystemHealth();
      
      res.status(200).json({
        success: true,
        message: 'System metrics retrieved successfully',
        data: health,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Manual cleanup trigger (admin only)
   */
  static async triggerCleanup(req, res, next) {
    try {
      const result = await OptimizedBusService.performScheduledCleanup();
      
      res.status(200).json({
        success: true,
        message: 'Cleanup completed successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

// Optimized routes with proper middleware
router.post('/start-tracking', validateStartTracking, OptimizedBusController.startTracking);
router.post('/stop-tracking', validateStopTracking, OptimizedBusController.stopTracking);

// High-performance location endpoints
router.post('/:busNumber/location', validateUpdateLocation, OptimizedBusController.updateLocation);
router.post('/locations/batch', OptimizedBusController.batchUpdateLocations);
router.get('/:busNumber/location/stream', OptimizedBusController.getLocationStream);

// Data retrieval endpoints with caching
router.get('/active', OptimizedBusController.getActiveBuses);
router.get('/dashboard', OptimizedBusController.getDashboard);
router.get('/:busNumber/history', validateGetHistory, OptimizedBusController.getBusHistory);

// System monitoring endpoints
router.get('/system/metrics', OptimizedBusController.getSystemMetrics);
router.post('/system/cleanup', OptimizedBusController.triggerCleanup);

module.exports = router;
