const { getSupabase } = require('../config/database');

class Bus {
  constructor(data) {
    this.id = data.id;
    this.busNumber = data.bus_number;
    this.driverName = data.driver_name;
    this.isActive = data.is_active;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  static async findByBusNumber(busNumber) {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('buses')
      .select('*')
      .eq('bus_number', busNumber)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows found
        return null;
      }
      throw error;
    }

    return data ? new Bus(data) : null;
  }

  static async create(busData) {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('buses')
      .insert([{
        bus_number: busData.busNumber,
        driver_name: busData.driverName || 'Unknown',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return new Bus(data);
  }

  static async updateActiveStatus(busNumber, isActive) {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('buses')
      .update({ 
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq('bus_number', busNumber)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return new Bus(data);
  }

  static async getAll() {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('buses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data.map(bus => new Bus(bus));
  }

  static async getActiveBuses() {
    const supabase = getSupabase();
    
    const { data, error } = await supabase
      .from('buses')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data.map(bus => new Bus(bus));
  }
}

module.exports = Bus;
