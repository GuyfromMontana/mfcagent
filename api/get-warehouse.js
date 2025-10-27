// API Endpoint: /api/get-warehouse
// Gets warehouse information

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { warehouse_code, city, region } = req.body;

    let dbQuery = supabase
      .from('warehouses')
      .select('*')
      .eq('is_active', true);

    if (warehouse_code) {
      dbQuery = dbQuery.eq('warehouse_code', warehouse_code);
    } else if (city) {
      dbQuery = dbQuery.ilike('city', `%${city}%`);
    } else if (region) {
      dbQuery = dbQuery.ilike('region', `%${region}%`);
    }

    const { data, error } = await dbQuery.limit(5);

    if (error) throw error;

    const warehouses = data.map(w => ({
      name: w.warehouse_name,
      city: w.city,
      state: w.state,
      phone: w.phone,
      email: w.email,
      region: w.region,
      service_area: w.service_area_description,
      hours: w.operating_hours
    }));

    return res.status(200).json({
      success: true,
      warehouses: warehouses,
      count: warehouses.length
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
