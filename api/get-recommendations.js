// API Endpoint: /api/get-recommendations
// Provides product recommendations based on livestock needs - VAPI COMPATIBLE VERSION
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

    // Get parameters
    const {
      livestock_type,
      herd_size,
      season,
      specific_need
    } = req.method === 'GET' ? req.query : req.body;

    if (!livestock_type) {
      return res.status(200).json({
        result: "To give you the best recommendations, I need to know what type of livestock you're working with. Are you raising cattle, horses, sheep, or something else?",
        error: true,
        error_type: "missing_livestock_type"
      });
    }

    // Query products based on livestock type
    let query = supabase
      .from('products')
      .select('*')
      .contains('livestock_types', [livestock_type.toLowerCase()])
      .eq('is_active', true);

    // Add seasonal filter if provided
    if (season) {
      query = query.contains('recommended_seasons', [season.toLowerCase()]);
    }

    // Add specific need filter if provided
    if (specific_need) {
      query = query.or(`category.ilike.%${specific_need}%,description.ilike.%${specific_need}%`);
    }

    const { data: products, error } = await query.limit(5);

    if (error) throw error;

    if (!products || products.length === 0) {
      return res.status(200).json({
        result: `I don't have specific product recommendations for ${livestock_type} right now. Let me connect you with one of our livestock specialists who can help. Would you like me to find the specialist for your area?`,
        error: true,
        error_type: "no_products_found",
        livestock_type: livestock_type
      });
    }

    // ✅ VAPI-COMPATIBLE RESPONSE FORMAT
    // Build conversational recommendation message
    let responseMessage = `Great! For your ${livestock_type}`;
    
    if (herd_size) {
      responseMessage += ` operation with ${herd_size} head`;
    }
    
    if (season) {
      responseMessage += ` during ${season}`;
    }
    
    responseMessage += `, I recommend: `;

    const recommendations = products.map((p, idx) => {
      let rec = p.product_name;
      if (p.description) {
        rec += ` - ${p.description}`;
      }
      return rec;
    });

    if (recommendations.length === 1) {
      responseMessage += recommendations[0];
    } else if (recommendations.length === 2) {
      responseMessage += recommendations.join(' and ');
    } else {
      responseMessage += recommendations.slice(0, -1).join(', ') + ', and ' + recommendations[recommendations.length - 1];
    }

    responseMessage += '. Would you like more details about any of these products?';

    return res.status(200).json({
      result: responseMessage,
      products: products.map(p => ({
        id: p.id,
        name: p.product_name,
        category: p.category,
        description: p.description,
        livestock_types: p.livestock_types
      })),
      count: products.length
    });

  } catch (error) {
    console.error('Error getting recommendations:', error);
    
    // ✅ VAPI-COMPATIBLE ERROR RESPONSE
    return res.status(200).json({
      result: "I'm having trouble accessing our product database right now. One of our livestock specialists can help you directly. Would you like me to find the specialist for your area?",
      error: true,
      error_type: "system_error",
      error_details: error.message
    });
  }
};
