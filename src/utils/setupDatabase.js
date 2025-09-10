const { getSupabase } = require('../config/database');

/**
 * Setup database tables and policies
 * This script creates the necessary tables in Supabase
 */
const setupDatabase = async () => {
  const supabase = getSupabase();

  try {
    console.log('🔧 Setting up database tables...');

    // Create buses table
    const { error: busesError } = await supabase.rpc('create_buses_table');
    if (busesError && !busesError.message.includes('already exists')) {
      console.error('❌ Error creating buses table:', busesError);
    } else {
      console.log('✅ Buses table ready');
    }

    // Create locations table
    const { error: locationsError } = await supabase.rpc('create_locations_table');
    if (locationsError && !locationsError.message.includes('already exists')) {
      console.error('❌ Error creating locations table:', locationsError);
    } else {
      console.log('✅ Locations table ready');
    }

    console.log('🎉 Database setup completed!');
    
    return true;
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    return false;
  }
};

// SQL for creating tables (to be run in Supabase SQL editor)
const getTableCreationSQL = () => {
  return `
-- Create buses table
CREATE TABLE IF NOT EXISTS buses (
  id SERIAL PRIMARY KEY,
  bus_number VARCHAR(20) UNIQUE NOT NULL,
  driver_name VARCHAR(100) DEFAULT 'Unknown',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create locations table
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number VARCHAR(20) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(8, 2) DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (bus_number) REFERENCES buses(bus_number) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_buses_number ON buses(bus_number);
CREATE INDEX IF NOT EXISTS idx_buses_active ON buses(is_active);
CREATE INDEX IF NOT EXISTS idx_locations_bus_number ON locations(bus_number);
CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp);
CREATE INDEX IF NOT EXISTS idx_locations_created_at ON locations(created_at);

-- Create RLS policies
ALTER TABLE buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (adjust as needed)
CREATE POLICY IF NOT EXISTS "Allow all for authenticated users" ON buses
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY IF NOT EXISTS "Allow all for authenticated users" ON locations
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER IF NOT EXISTS update_buses_updated_at 
  BEFORE UPDATE ON buses 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
`;
};

module.exports = {
  setupDatabase,
  getTableCreationSQL
};
