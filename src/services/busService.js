const Bus = require('../models/Bus');
const Location = require('../models/Location');

class BusService {
  /**
   * Start tracking a bus
   */
  static async startTracking(busNumber, driverName = 'Unknown') {
    try {
      // Check if bus already exists
      let bus = await Bus.findByBusNumber(busNumber);
      
      if (!bus) {
        // Create new bus if it doesn't exist
        bus = await Bus.create({
          busNumber,
          driverName
        });
        console.log(`📍 Created new bus: ${busNumber}`);
      } else {
        // Update existing bus to active
        bus = await Bus.updateActiveStatus(busNumber, true);
        console.log(`🔄 Reactivated bus: ${busNumber}`);
      }

      return {
        success: true,
        message: `Bus ${busNumber} tracking started successfully`,
        bus: bus
      };
    } catch (error) {
      console.error(`❌ Error starting tracking for bus ${busNumber}:`, error);
      throw new Error(`Failed to start tracking: ${error.message}`);
    }
  }

  /**
   * Stop tracking a bus
   */
  static async stopTracking(busNumber) {
    try {
      const bus = await Bus.findByBusNumber(busNumber);
      
      if (!bus) {
        throw new Error(`Bus ${busNumber} not found`);
      }

      await Bus.updateActiveStatus(busNumber, false);
      console.log(`🛑 Stopped tracking bus: ${busNumber}`);

      return {
        success: true,
        message: `Bus ${busNumber} tracking stopped successfully`
      };
    } catch (error) {
      console.error(`❌ Error stopping tracking for bus ${busNumber}:`, error);
      throw new Error(`Failed to stop tracking: ${error.message}`);
    }
  }

  /**
   * Update bus location
   */
  static async updateLocation(busNumber, locationData) {
    try {
      // Validate required fields
      if (!locationData.latitude || !locationData.longitude) {
        throw new Error('Latitude and longitude are required');
      }

      // Check if bus exists and is active
      const bus = await Bus.findByBusNumber(busNumber);
      if (!bus) {
        throw new Error(`Bus ${busNumber} not found. Please start tracking first.`);
      }

      if (!bus.isActive) {
        throw new Error(`Bus ${busNumber} is not currently being tracked`);
      }

      // Create location record
      const location = await Location.create({
        busNumber,
        latitude: parseFloat(locationData.latitude),
        longitude: parseFloat(locationData.longitude),
        accuracy: parseFloat(locationData.accuracy) || 0,
        timestamp: locationData.timestamp || new Date().toISOString()
      });

      console.log(`📍 Location updated for bus ${busNumber}: ${location.latitude}, ${location.longitude}`);

      return {
        success: true,
        message: `Location updated for bus ${busNumber}`,
        location: location
      };
    } catch (error) {
      console.error(`❌ Error updating location for bus ${busNumber}:`, error);
      throw new Error(`Failed to update location: ${error.message}`);
    }
  }

  /**
   * Get all active buses with their latest locations
   */
  static async getActiveBusesWithLocations() {
    try {
      const activeBuses = await Bus.getActiveBuses();
      const busesWithLocations = [];

      for (const bus of activeBuses) {
        const latestLocation = await Location.getLatestByBusNumber(bus.busNumber);
        busesWithLocations.push({
          bus: bus,
          latestLocation: latestLocation
        });
      }

      return busesWithLocations;
    } catch (error) {
      console.error('❌ Error getting active buses with locations:', error);
      throw new Error(`Failed to get active buses: ${error.message}`);
    }
  }

  /**
   * Get bus tracking history
   */
  static async getBusHistory(busNumber, hours = 24) {
    try {
      const bus = await Bus.findByBusNumber(busNumber);
      if (!bus) {
        throw new Error(`Bus ${busNumber} not found`);
      }

      const endTime = new Date();
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);

      const locations = await Location.getLocationsByTimeRange(
        busNumber,
        startTime.toISOString(),
        endTime.toISOString()
      );

      return {
        bus: bus,
        locations: locations,
        totalLocations: locations.length,
        timeRange: {
          start: startTime.toISOString(),
          end: endTime.toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ Error getting history for bus ${busNumber}:`, error);
      throw new Error(`Failed to get bus history: ${error.message}`);
    }
  }

  /**
   * Get real-time dashboard data
   */
  static async getDashboardData() {
    try {
      const activeBuses = await Bus.getActiveBuses();
      const recentLocations = await Location.getBusesWithRecentLocations(30); // Last 30 minutes
      
      return {
        totalActiveBuses: activeBuses.length,
        activeBuses: activeBuses,
        recentLocations: recentLocations,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error getting dashboard data:', error);
      throw new Error(`Failed to get dashboard data: ${error.message}`);
    }
  }

  /**
   * Cleanup old location data
   */
  static async cleanupOldData(daysOld = 7) {
    try {
      const result = await Location.deleteOldLocations(daysOld);
      console.log(`🧹 Cleaned up location data older than ${daysOld} days`);
      return result;
    } catch (error) {
      console.error('❌ Error cleaning up old data:', error);
      throw new Error(`Failed to cleanup old data: ${error.message}`);
    }
  }
}

module.exports = BusService;
