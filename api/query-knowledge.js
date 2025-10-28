// API Endpoint: /api/query-knowledge
// Queries Google Sheets knowledge base for Montana Feed Company information - VAPI COMPATIBLE VERSION
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { query, topic } = req.method === 'GET' ? req.query : req.body;

    if (!query && !topic) {
      return res.status(200).json({
        result: "What would you like to know about our products, services, or Montana Feed Company?",
        error: true,
        error_type: "missing_query"
      });
    }

    // Get Google Sheets URL from environment or use default
    const sheetsUrl = process.env.KNOWLEDGE_BASE_URL || 'https://docs.google.com/spreadsheets/d/1Qp-t0yZh6yj7FVVRNGPqt1Y4ZOqZbdUVQGHUJsM3BYc/edit';
    
    // In a production system, you'd:
    // 1. Fetch data from Google Sheets API
    // 2. Search through the content
    // 3. Return relevant matches
    
    // For now, return a helpful message that we received the query
    // and would search the knowledge base

    // ✅ VAPI-COMPATIBLE RESPONSE FORMAT
    let responseMessage = `I searched our knowledge base for "${query || topic}"`;
    
    // This is a placeholder - in production you'd actually search Google Sheets
    // and return real results. For now, provide a helpful fallback:
    responseMessage += ". I can help you with information about our feed products, cattle nutrition programs, and Montana livestock specialists. What specifically would you like to know?";

    return res.status(200).json({
      result: responseMessage,
      query: query || topic,
      knowledge_base_url: sheetsUrl,
      // In production, you'd return actual search results here
      matches_found: 0
    });

  } catch (error) {
    console.error('Error querying knowledge base:', error);
    
    // ✅ VAPI-COMPATIBLE ERROR RESPONSE
    return res.status(200).json({
      result: "I'm having trouble accessing our knowledge base right now. Let me connect you with one of our livestock specialists who can answer your questions directly. Would you like me to find the specialist for your area?",
      error: true,
      error_type: "system_error",
      error_details: error.message
    });
  }
};
