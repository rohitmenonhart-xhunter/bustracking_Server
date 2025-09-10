const { createClient } = require('@supabase/supabase-js');

let supabase = null;

const connectSupabase = async () => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables. Please check SUPABASE_URL and SUPABASE_ANON_KEY');
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    
    // Test the connection
    const { data, error } = await supabase
      .from('buses')
      .select('count')
      .limit(1);

    if (error && error.code !== 'PGRST116') { // PGRST116 is "table not found" which is OK for first run
      console.warn('⚠️  Supabase connection test warning:', error.message);
    }

    console.log('✅ Supabase client initialized successfully');
    return supabase;
  } catch (error) {
    console.error('❌ Failed to connect to Supabase:', error.message);
    throw error;
  }
};

const getSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase not initialized. Call connectSupabase() first.');
  }
  return supabase;
};

module.exports = {
  connectSupabase,
  getSupabase
};
