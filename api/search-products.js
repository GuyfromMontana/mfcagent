// API Endpoint: /api/search-products
// Searches Montana Feed Company products

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Enable CORS for Vapi
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { query, category, livestock_type } = req.body || {};

    let dbQuery = supabase
      .from('products')
      .select('*')
      .eq('is_active', true);

    if (query) {
      dbQuery = dbQuery.or(`product_name.ilike.%${query}%,description.ilike.%${query}%`);
    }

    if (category) {
      dbQuery = dbQuery.eq('category', category);
    }

    if (livestock_type) {
      dbQuery = dbQuery.eq('livestock_type', livestock_type);
    }

    const { data, error } = await dbQuery.limit(10);

    if (error) throw error;

    const products = data.map(p => ({
      name: p.product_name,
      code: p.product_code,
      category: p.category,
      description: p.description,
      protein: p.protein_percentage,
      feeding_rate: p.nutritional_details?.feeding_rate_lbs || p.nutritional_details?.feeding_rate_oz,
      unit: p.unit_type
    }));

    return res.status(200).json({
      success: true,
      products: products,
      count: products.length
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
