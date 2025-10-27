// API Endpoint: /api/find-specialist
// Finds appropriate specialist based on location

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { county, city, state } = req.body || {}; 
    let territory = null;

    if (county) {
      const { data } = await supabase
        .from('territories')
        .select('id, territory_name, territory_code')
        .contains('counties', [county])
        .eq('is_active', true)
        .limit(1);
      
      if (data && data.length > 0) territory = data[0];
    }

    if (!territory && zip_code) {
      const { data } = await supabase
        .from('territories')
        .select('id, territory_name, territory_code')
        .contains('zip_codes', [zip_code])
        .eq('is_active', true)
        .limit(1);
      
      if (data && data.length > 0) territory = data[0];
    }

    if (!territory && state) {
      const { data } = await supabase
        .from('territories')
        .select('id, territory_name, territory_code')
        .eq('state', state)
        .eq('is_active', true)
        .limit(1);
      
      if (data && data.length > 0) territory = data[0];
    }

    if (!territory) {
      return res.status(200).json({
        success: true,
        message: 'Unable to determine territory. Please contact any Montana Feed Company warehouse.',
        specialists: []
      });
    }

    const { data: specialists, error } = await supabase
      .from('specialists')
      .select('first_name, last_name, email, phone, specialties')
      .eq('territory_id', territory.id)
      .eq('is_active', true);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      territory: territory.territory_name,
      specialists: specialists.map(s => ({
        name: `${s.first_name} ${s.last_name}`,
        phone: s.phone,
        email: s.email,
        specialties: s.specialties
      }))
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
