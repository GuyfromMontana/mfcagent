// API Endpoint: /api/find-specialist
// Finds the appropriate livestock specialist based on county - VAPI COMPATIBLE VERSION
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

    // Get county from query params or body
    const county = req.method === 'GET' 
      ? req.query.county 
      : req.body?.county;

    if (!county) {
      return res.status(200).json({
        result: "I need to know which county you're in to find the right specialist for you. Which Montana county is your ranch located in?",
        error: true,
        error_type: "missing_county"
      });
    }

    // Find territory by county
    const { data: territories, error: territoryError } = await supabase
      .from('territories')
      .select('id, territory_name, counties')
      .contains('counties', [county])
      .limit(1);

    if (territoryError) throw territoryError;

    if (!territories || territories.length === 0) {
      return res.status(200).json({
        result: `I couldn't find a territory assignment for ${county} County. Let me connect you with our main office at 406-683-2189, and they'll make sure you get the right specialist.`,
        error: true,
        error_type: "territory_not_found",
        county: county
      });
    }

    const territory = territories[0];

    // Find specialist for this territory
    const { data: specialists, error: specialistError } = await supabase
      .from('specialists')
      .select('id, first_name, last_name, phone, email, specialties')
      .eq('territory_id', territory.id)
      .eq('is_active', true)
      .limit(1);

    if (specialistError) throw specialistError;

    if (!specialists || specialists.length === 0) {
      return res.status(200).json({
        result: `Your area is covered by our ${territory.territory_name} territory, but I don't have a specialist assigned there right now. Our main office at 406-683-2189 can help you directly.`,
        error: true,
        error_type: "no_specialist_assigned",
        territory: territory.territory_name,
        county: county
      });
    }

    const specialist = specialists[0];
    const specialistName = `${specialist.first_name} ${specialist.last_name}`;

    // ✅ VAPI-COMPATIBLE RESPONSE FORMAT
    // Create a conversational message about the specialist
    let responseMessage = `Great! For ${county} County, your livestock specialist is ${specialistName}`;
    
    if (specialist.phone) {
      responseMessage += `. You can reach them at ${specialist.phone}`;
    }
    
    if (specialist.specialties && specialist.specialties.length > 0) {
      responseMessage += `. They specialize in ${specialist.specialties.join(', ')}`;
    }
    
    responseMessage += '.';

    return res.status(200).json({
      result: responseMessage,
      specialist: {
        id: specialist.id,
        name: specialistName,
        first_name: specialist.first_name,
        last_name: specialist.last_name,
        phone: specialist.phone,
        email: specialist.email,
        specialties: specialist.specialties
      },
      territory: {
        id: territory.id,
        name: territory.territory_name
      },
      county: county
    });

  } catch (error) {
    console.error('Error finding specialist:', error);
    
    // ✅ VAPI-COMPATIBLE ERROR RESPONSE
    return res.status(200).json({
      result: "I'm having trouble looking up specialist information right now. You can call our main office at 406-683-2189 and they'll connect you with the right person.",
      error: true,
      error_type: "system_error",
      error_details: error.message
    });
  }
};
