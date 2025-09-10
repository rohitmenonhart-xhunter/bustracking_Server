const { executeQuery, executeBatchInsert } = require('../config/optimizedDatabase');

class OptimizedBus {
  constructor(data) {
    this.id = data.id;
    this.busNumber = data.bus_number;
    this.driverName = data.driver_name;
    this.isActive = data.is_active;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  static async findByBusNumber(busNumber) {
    const query = 'SELECT * FROM buses WHERE bus_number = $1';
    const result = await executeQuery(query, [busNumber]);
    
    return result.rows.length > 0 ? new OptimizedBus(result.rows[0]) : null;
  }

  static async create(busData) {
    const query = `
      INSERT INTO buses (bus_number, driver_name, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING *
    `;
    
    const values = [
      busData.busNumber,
      busData.driverName || 'Unknown',
      true
    ];
    
    const result = await executeQuery(query, values);
    return new OptimizedBus(result.rows[0]);
  }

  static async updateActiveStatus(busNumber, isActive) {
    const query = `
      UPDATE buses 
      SET is_active = $1, updated_at = NOW()
      WHERE bus_number = $2
      RETURNING *
    `;
    
    const result = await executeQuery(query, [isActive, busNumber]);
    
    if (result.rows.length === 0) {
      throw new Error(`Bus ${busNumber} not found`);
    }
    
    return new OptimizedBus(result.rows[0]);
  }

  static async getActiveBuses() {
    const query = `
      SELECT * FROM buses 
      WHERE is_active = true 
      ORDER BY updated_at DESC
    `;
    
    const result = await executeQuery(query);
    return result.rows.map(bus => new OptimizedBus(bus));
  }

  // Batch operations for efficiency
  static async batchUpdateActiveStatus(busNumbers, isActive) {
    if (busNumbers.length === 0) return [];
    
    const placeholders = busNumbers.map((_, i) => `$${i + 2}`).join(', ');
    const query = `
      UPDATE buses 
      SET is_active = $1, updated_at = NOW()
      WHERE bus_number IN (${placeholders})
      RETURNING *
    `;
    
    const result = await executeQuery(query, [isActive, ...busNumbers]);
    return result.rows.map(bus => new OptimizedBus(bus));
  }

  // Get buses with recent activity (optimized for dashboard)
  static async getActiveBusesWithRecentActivity(minutesAgo = 30) {
    const query = `
      SELECT 
        b.*,
        l.latitude,
        l.longitude,
        l.accuracy,
        l.timestamp as last_location_time
      FROM buses b
      LEFT JOIN LATERAL (
        SELECT latitude, longitude, accuracy, timestamp
        FROM locations 
        WHERE bus_number = b.bus_number 
        ORDER BY timestamp DESC 
        LIMIT 1
      ) l ON true
      WHERE b.is_active = true
        AND (l.timestamp IS NULL OR l.timestamp >= NOW() - INTERVAL '${minutesAgo} minutes')
      ORDER BY l.timestamp DESC NULLS LAST
    `;
    
    const result = await executeQuery(query);
    
    return result.rows.map(row => ({
      bus: new OptimizedBus(row),
      latestLocation: row.latitude ? {
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        accuracy: parseFloat(row.accuracy || 0),
        timestamp: row.last_location_time
      } : null
    }));
  }
}

module.exports = OptimizedBus;
