const { Pool } = require('pg');
require('dotenv').config();

const createTables = async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔧 Connecting to PostgreSQL...');
    
    // Create buses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS buses (
        id SERIAL PRIMARY KEY,
        bus_number VARCHAR(20) UNIQUE NOT NULL,
        driver_name VARCHAR(100) DEFAULT 'Unknown',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Buses table created');

    // Create locations table
    await pool.query(`
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
    `);
    console.log('✅ Locations table created');

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_buses_number ON buses(bus_number);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_buses_active ON buses(is_active);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_locations_bus_number ON locations(bus_number);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_locations_created_at ON locations(created_at);`);
    console.log('✅ Indexes created');

    // Create update function
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create trigger
    await pool.query(`
      DROP TRIGGER IF EXISTS update_buses_updated_at ON buses;
      CREATE TRIGGER update_buses_updated_at 
        BEFORE UPDATE ON buses 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✅ Triggers created');

    console.log('🎉 Database setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
  } finally {
    await pool.end();
  }
};

createTables();
