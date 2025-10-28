Output

// API Endpoint: /api/search-products
// Searches products database by name, category, or description - VAPI COMPATIBLE VERSION
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

    // Get search parameters
    const {
      search_term,
      category,
      livestock_type
    } = req.method === 'GET' ? req.query : req.body;

    if (!search_term && !category && !livestock_type) {
      return res.status(200).json({
        result: "What product are you looking for? You can tell me a product name, category like 'minerals' or 'supplements', or the type of livestock.",
        error: true,
        error_type: "missing_search_term"
      });
    }

    // Build search query
    let query = supabase
      .from('products')
      .select('*')
      .eq('is_active', true);

    // Search by term (product name or description)
    if (search_term) {
      query = query.or(`product_name.ilike.%${search_term}%,description.ilike.%${search_term}%,category.ilike.%${search_term}%`);
    }

    // Filter by category
    if (category) {
      query = query.ilike('category', `%${category}%`);
    }

    // Filter by livestock type
    if (livestock_type) {
      query = query.contains('livestock_types', [livestock_type.toLowerCase()]);
    }

    const { data: products, error } = await query.limit(5);

    if (error) throw error;

    if (!products || products.length === 0) {
      let notFoundMessage = `I couldn't find any products`;
      
      if (search_term) {
        notFoundMessage += ` matching "${search_term}"`;
      }
      if (category) {
        notFoundMessage += ` in the ${category} category`;
      }
      if (livestock_type) {
        notFoundMessage += ` for ${livestock_type}`;
      }
      
      notFoundMessage += `. Would you like me to connect you with one of our livestock specialists who can help you find what you need?`;

      return res.status(200).json({
        result: notFoundMessage,
        error: true,
        error_type: "no_products_found",
        search_term,
        category,
        livestock_type
      });
    }

    // ✅ VAPI-COMPATIBLE RESPONSE FORMAT
    // Build conversational search results message
    let responseMessage = `I found ${products.length} product${products.length === 1 ? '' : 's'}`;
    
    if (search_term) {
      responseMessage += ` for "${search_term}"`;
    }
    if (livestock_type) {
      responseMessage += ` for ${livestock_type}`;
    }
    
    responseMessage += ': ';

    const productDescriptions = products.map((p, idx) => {
      let desc = p.product_name;
      if (p.category) {
        desc += ` (${p.category})`;
      }
      if (p.description) {
        desc += ` - ${p.description}`;
      }
      return desc;
    });

    if (productDescriptions.length === 1) {
      responseMessage += productDescriptions[0];
    } else if (productDescriptions.length === 2) {
      responseMessage += productDescriptions.join(' and ');
    } else {
      const lastProduct = productDescriptions.pop();
      responseMessage += productDescriptions.join(', ') + ', and ' + lastProduct;
    }

    responseMessage += '. Would you like more information about any of these?';

    return res.status(200).json({
      result: responseMessage,
      products: products.map(p => ({
        id: p.id,
        name: p.product_name,
        category: p.category,
        description: p.description,
        livestock_types: p.livestock_types,
        price: p.price
      })),
      count: products.length
    });

  } catch (error) {
    console.error('Error searching products:', error);
    
    // ✅ VAPI-COMPATIBLE ERROR RESPONSE
    return res.status(200).json({
      result: "I'm having trouble searching our product database right now. One of our livestock specialists can help you find what you need. Would you like me to find the specialist for your area?",
      error: true,
      error_type: "system_error",
      error_details: error.message
    });
  }
};



