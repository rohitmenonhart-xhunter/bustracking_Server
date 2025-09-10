const { executeQuery, executeBatchInsert } = require('../config/optimizedDatabase');
const { v4: uuidv4 } = require('uuid');

class OptimizedLocation {
  constructor(data) {
    this.id = data.id;
    this.busNumber = data.bus_number;
    this.latitude = parseFloat(data.latitude);
    this.longitude = parseFloat(data.longitude);
    this.accuracy = parseFloat(data.accuracy || 0);
    this.timestamp = data.timestamp;
    this.createdAt = data.created_at;
  }

  static async create(locationData) {
    const query = `
      INSERT INTO locations (id, bus_number, latitude, longitude, accuracy, timestamp, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;
    
    const values = [
      uuidv4(),
      locationData.busNumber,
      locationData.latitude,
      locationData.longitude,
      locationData.accuracy || 0,
      locationData.timestamp || new Date().toISOString()
    ];
    
    const result = await executeQuery(query, values);
    return new OptimizedLocation(result.rows[0]);
  }

  // Batch insert for multiple locations (more efficient for bulk updates)
  static async batchCreate(locationsData) {
    if (locationsData.length === 0) return [];
    
    const columns = ['id', 'bus_number', 'latitude', 'longitude', 'accuracy', 'timestamp', 'created_at'];
    const values = locationsData.map(loc => [
      uuidv4(),
      loc.busNumber,
      loc.latitude,
      loc.longitude,
      loc.accuracy || 0,
      loc.timestamp || new Date().toISOString(),
      new Date().toISOString()
    ]);
    
    const result = await executeBatchInsert('locations', columns, values);
    return result.rows.map(row => new OptimizedLocation(row));
  }

  static async getLatestByBusNumber(busNumber) {
    const query = `
      SELECT * FROM locations 
      WHERE bus_number = $1 
      ORDER BY timestamp DESC 
      LIMIT 1
    `;
    
    const result = await executeQuery(query, [busNumber]);
    return result.rows.length > 0 ? new OptimizedLocation(result.rows[0]) : null;
  }

  static async getByBusNumber(busNumber, limit = 50) {
    const query = `
      SELECT * FROM locations 
      WHERE bus_number = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `;
    
    const result = await executeQuery(query, [busNumber, limit]);
    return result.rows.map(location => new OptimizedLocation(location));
  }

  // Optimized for free tier - get recent locations with intelligent sampling
  static async getRecentLocationsOptimized(minutesAgo = 30, maxPerBus = 10) {
    const query = `
      WITH recent_locations AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (PARTITION BY bus_number ORDER BY timestamp DESC) as rn
        FROM locations 
        WHERE timestamp >= NOW() - INTERVAL '${minutesAgo} minutes'
      )
      SELECT * FROM recent_locations 
      WHERE rn <= $1
      ORDER BY bus_number, timestamp DESC
    `;
    
    const result = await executeQuery(query, [maxPerBus]);
    
    // Group by bus number
    const locationsByBus = {};
    result.rows.forEach(row => {
      const location = new OptimizedLocation(row);
      if (!locationsByBus[location.busNumber]) {
        locationsByBus[location.busNumber] = [];
      }
      locationsByBus[location.busNumber].push(location);
    });
    
    return locationsByBus;
  }

  // Get latest location for multiple buses efficiently
  static async getLatestForMultipleBuses(busNumbers) {
    if (busNumbers.length === 0) return {};
    
    const placeholders = busNumbers.map((_, i) => `$${i + 1}`).join(', ');
    const query = `
      SELECT DISTINCT ON (bus_number) 
        bus_number, latitude, longitude, accuracy, timestamp, created_at
      FROM locations 
      WHERE bus_number IN (${placeholders})
      ORDER BY bus_number, timestamp DESC
    `;
    
    const result = await executeQuery(query, busNumbers);
    
    const locations = {};
    result.rows.forEach(row => {
      locations[row.bus_number] = new OptimizedLocation({
        id: null,
        bus_number: row.bus_number,
        latitude: row.latitude,
        longitude: row.longitude,
        accuracy: row.accuracy,
        timestamp: row.timestamp,
        created_at: row.created_at
      });
    });
    
    return locations;
  }

  // Efficient cleanup with smart retention
  static async smartCleanup(daysOld = 7, keepSampleEvery = 10) {
    // Keep one location every N records for historical data, delete the rest
    const query = `
      WITH numbered_locations AS (
        SELECT 
          id,
          ROW_NUMBER() OVER (PARTITION BY bus_number ORDER BY timestamp DESC) as rn
        FROM locations 
        WHERE created_at < NOW() - INTERVAL '${daysOld} days'
      )
      DELETE FROM locations 
      WHERE id IN (
        SELECT id FROM numbered_locations 
        WHERE rn % $1 != 0  -- Keep every Nth record
      )
    `;
    
    const result = await executeQuery(query, [keepSampleEvery]);
    return result.rowCount;
  }

  // Get location statistics (for monitoring free tier usage)
  static async getLocationStats() {
    const query = `
      SELECT 
        COUNT(*) as total_locations,
        COUNT(DISTINCT bus_number) as unique_buses,
        MIN(created_at) as oldest_record,
        MAX(created_at) as newest_record
      FROM locations
    `;
    
    const result = await executeQuery(query);
    return result.rows[0];
  }
}

module.exports = OptimizedLocation;
