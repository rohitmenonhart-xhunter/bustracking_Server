const { getSupabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Location {
  constructor(data) {
    this.id = data.id;
    this.busNumber = data.bus_number;
    this.latitude = data.latitude;
    this.longitude = data.longitude;
    this.accuracy = data.accuracy;
    this.timestamp = data.timestamp;
    this.createdAt = data.created_at;
  }

  static async create(locationData) {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('locations')
      .insert([{
        id: uuidv4(),
        bus_number: locationData.busNumber,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        accuracy: locationData.accuracy,
        timestamp: locationData.timestamp || new Date().toISOString(),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return new Location(data);
  }

  static async getByBusNumber(busNumber, limit = 50) {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('bus_number', busNumber)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data.map(location => new Location(location));
  }

  static async getLatestByBusNumber(busNumber) {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('bus_number', busNumber)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows found
        return null;
      }
      throw error;
    }

    return new Location(data);
  }

  static async getLocationsByTimeRange(busNumber, startTime, endTime) {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('bus_number', busNumber)
      .gte('timestamp', startTime)
      .lte('timestamp', endTime)
      .order('timestamp', { ascending: true });

    if (error) {
      throw error;
    }

    return data.map(location => new Location(location));
  }

  static async deleteOldLocations(daysOld = 7) {
    const supabase = getSupabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const { data, error } = await supabase
      .from('locations')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      throw error;
    }

    return data;
  }

  static async getBusesWithRecentLocations(minutesAgo = 30) {
    const supabase = getSupabase();
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - minutesAgo);
    
    const { data, error } = await supabase
      .from('locations')
      .select('bus_number, latitude, longitude, accuracy, timestamp')
      .gte('timestamp', cutoffTime.toISOString())
      .order('timestamp', { ascending: false });

    if (error) {
      throw error;
    }

    // Group by bus number and get the latest location for each
    const latestLocations = {};
    data.forEach(location => {
      if (!latestLocations[location.bus_number] || 
          new Date(location.timestamp) > new Date(latestLocations[location.bus_number].timestamp)) {
        latestLocations[location.bus_number] = new Location(location);
      }
    });

    return Object.values(latestLocations);
  }
}

module.exports = Location;
