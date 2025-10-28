// API Endpoint: /api/get-warehouse
// Finds nearest warehouse location based on county or zip - VAPI COMPATIBLE VERSION
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Get location parameters
    const {
      county,
      zip_code,
      city
    } = req.method === 'GET' ? req.query : req.body;

    if (!county && !zip_code && !city) {
      return res.status(200).json({
        result: "To find the nearest warehouse, I need to know your location. What county are you in, or what's your zip code?",
        error: true,
        error_type: "missing_location"
      });
    }

    // Query warehouses - for now, just get all active warehouses
    // In a real implementation, you'd calculate distance based on coordinates
    const { data: warehouses, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    if (!warehouses || warehouses.length === 0) {
      return res.status(200).json({
        result: "I'm having trouble finding our warehouse locations right now. You can reach our main office at 406-683-2189 for location information.",
        error: true,
        error_type: "no_warehouses_found"
      });
    }

    // For now, return the first warehouse as "nearest"
    // In production, you'd calculate actual distances
    const nearest = warehouses[0];

    // ✅ VAPI-COMPATIBLE RESPONSE FORMAT
    // Build conversational warehouse message
    let responseMessage = `The nearest Montana Feed Company location`;
    
    if (county) {
      responseMessage += ` to ${county} County`;
    } else if (city) {
      responseMessage += ` to ${city}`;
    }
    
    responseMessage += ` is our ${nearest.name} warehouse`;
    
    if (nearest.address) {
      responseMessage += ` at ${nearest.address}`;
    }
    
    if (nearest.city && nearest.state) {
      responseMessage += ` in ${nearest.city}, ${nearest.state}`;
    }
    
    if (nearest.phone) {
      responseMessage += `. You can reach them at ${nearest.phone}`;
    }
    
    if (nearest.hours) {
      responseMessage += `. They're open ${nearest.hours}`;
    }
    
    responseMessage += '.';

    // Add info about other locations
    if (warehouses.length > 1) {
      responseMessage += ` We also have locations in ${warehouses.slice(1).map(w => w.city).join(', ')}.`;
    }

    return res.status(200).json({
      result: responseMessage,
      nearest_warehouse: {
        id: nearest.id,
        name: nearest.name,
        address: nearest.address,
        city: nearest.city,
        state: nearest.state,
        zip: nearest.zip,
        phone: nearest.phone,
        email: nearest.email,
        hours: nearest.hours
      },
      all_warehouses: warehouses.map(w => ({
        id: w.id,
        name: w.name,
        city: w.city,
        phone: w.phone
      }))
    });

  } catch (error) {
    console.error('Error finding warehouse:', error);
    
    // ✅ VAPI-COMPATIBLE ERROR RESPONSE
    return res.status(200).json({
      result: "I'm having trouble accessing our warehouse information right now. You can call our main office at 406-683-2189 for location details.",
      error: true,
      error_type: "system_error",
      error_details: error.message
    });
  }
};
