// API Endpoint: /api/get-recommendations
// Gets product recommendations based on needs

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

    const { livestock_type, production_stage, season, need } = req.body;

    let dbQuery = supabase
      .from('products')
      .select('*')
      .eq('is_active', true);

    if (livestock_type) {
      dbQuery = dbQuery.eq('livestock_type', livestock_type);
    }

    if (need) {
      const categoryMap = {
        'mineral': 'Minerals',
        'protein': 'Protein Supplements',
        'energy': 'Grains',
        'show': 'Complete Feeds'
      };
      const category = categoryMap[need.toLowerCase()];
      if (category) {
        dbQuery = dbQuery.eq('category', category);
      }
    }

    const { data, error } = await dbQuery
      .order('is_featured', { ascending: false })
      .limit(5);

    if (error) throw error;

    const recommendations = data.map(p => ({
      name: p.product_name,
      code: p.product_code,
      category: p.category,
      description: p.description,
      why_recommended: generateReason(p, production_stage, season, need)
    }));

    return res.status(200).json({
      success: true,
      recommendations: recommendations,
      count: recommendations.length
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

function generateReason(product, stage, season, need) {
  let reason = `${product.product_name} is recommended because `;
  
  if (product.product_code === 'AV4-50' && stage === 'pregnant') {
    reason += 'it contains organic trace minerals specifically formulated for pregnant and lactating cows.';
  } else if (product.product_code === 'XPC-50' && season === 'winter') {
    reason += 'it provides high protein (38%) to extend hay supplies during winter feeding.';
  } else if (product.category === 'Minerals') {
    reason += 'proper mineral supplementation is essential for cattle health and performance.';
  } else if (product.category === 'Protein Supplements') {
    reason += 'protein supplementation helps maintain body condition and supports production needs.';
  } else {
    reason += `it's a quality ${product.category.toLowerCase()} product for ${product.livestock_type.toLowerCase()}.`;
  }
  
  return reason;
}
