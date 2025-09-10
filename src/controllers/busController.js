const { validationResult } = require('express-validator');
const BusService = require('../services/busService');

class BusController {
  /**
   * Start tracking a bus
   * POST /api/buses/start-tracking
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
      
      const result = await BusService.startTracking(busNumber, driverName);
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Stop tracking a bus
   * POST /api/buses/stop-tracking
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
      
      const result = await BusService.stopTracking(busNumber);
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all active buses with locations
   * GET /api/buses/active
   */
  static async getActiveBuses(req, res, next) {
    try {
      const result = await BusService.getActiveBusesWithLocations();
      
      res.status(200).json({
        success: true,
        message: 'Active buses retrieved successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get bus tracking history
   * GET /api/buses/:busNumber/history
   */
  static async getBusHistory(req, res, next) {
    try {
      const { busNumber } = req.params;
      const { hours = 24 } = req.query;
      
      const result = await BusService.getBusHistory(busNumber, parseInt(hours));
      
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
   * Get dashboard data
   * GET /api/buses/dashboard
   */
  static async getDashboard(req, res, next) {
    try {
      const result = await BusService.getDashboardData();
      
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
   * Update bus location
   * POST /api/buses/:busNumber/location
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
      
      const result = await BusService.updateLocation(busNumber, locationData);
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current location of a specific bus
   * GET /api/buses/:busNumber/location
   */
  static async getCurrentLocation(req, res, next) {
    try {
      const { busNumber } = req.params;
      
      const Location = require('../models/Location');
      const latestLocation = await Location.getLatestByBusNumber(busNumber);
      
      if (!latestLocation) {
        return res.status(404).json({
          success: false,
          message: `No location data found for bus ${busNumber}`
        });
      }
      
      res.status(200).json({
        success: true,
        message: `Current location for bus ${busNumber}`,
        data: latestLocation
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cleanup old location data
   * DELETE /api/buses/cleanup
   */
  static async cleanupOldData(req, res, next) {
    try {
      const { days = 7 } = req.query;
      
      const result = await BusService.cleanupOldData(parseInt(days));
      
      res.status(200).json({
        success: true,
        message: `Cleaned up location data older than ${days} days`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = BusController;
