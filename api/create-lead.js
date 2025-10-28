// API Endpoint: /api/create-lead
// Creates a new lead in the system - VAPI COMPATIBLE VERSION
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

    // Handle both old format (first_name/last_name) and new format (name)
    const {
      name,           // NEW: Full name from Vapi
      first_name,     // OLD: Separate first name
      last_name,      // OLD: Separate last name
      phone,
      email,
      ranch_name,
      county,
      zip_code,
      livestock_types,
      herd_size,
      notes,          // NEW: Notes from Vapi
      primary_interest, // OLD: Primary interest
      conversation_id
    } = req.body || {};

    // Parse name into first_name and last_name if provided as single field
    let finalFirstName = first_name;
    let finalLastName = last_name;
    
    if (name && !first_name && !last_name) {
      // Split "Guy Hanson" into "Guy" and "Hanson"
      const nameParts = name.trim().split(/\s+/);
      finalFirstName = nameParts[0] || null;
      finalLastName = nameParts.slice(1).join(' ') || null;
    }

    // Use notes if primary_interest not provided
    const finalPrimaryInterest = primary_interest || notes;

    // Find territory
    let territory_id = null;
    if (county) {
      const { data } = await supabase
        .from('territories')
        .select('id')
        .contains('counties', [county])
        .limit(1);
      
      if (data && data.length > 0) territory_id = data[0].id;
    }

    // Find specialist
    let assigned_specialist_id = null;
    if (territory_id) {
      const { data } = await supabase
        .from('specialists')
        .select('id')
        .eq('territory_id', territory_id)
        .eq('is_active', true)
        .limit(1);
      
      if (data && data.length > 0) assigned_specialist_id = data[0].id;
    }

    // Create lead
    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        first_name: finalFirstName,
        last_name: finalLastName,
        phone: phone || null,
        email: email || null,
        ranch_name: ranch_name || null,
        zip_code: zip_code || null,
        territory_id,
        assigned_specialist_id,
        livestock_types: livestock_types || null,
        herd_size: herd_size || null,
        primary_interest: finalPrimaryInterest,
        lead_source: 'Voice Agent Call',
        lead_status: 'new',
        initial_conversation_id: conversation_id,
        follow_up_required: true
      })
      .select()
      .single();

    if (error) throw error;

    // ✅ VAPI-COMPATIBLE RESPONSE FORMAT
    // Return a simple message that Vapi can use in the conversation
    const responseMessage = assigned_specialist_id 
      ? `Great! I've saved your information and assigned your inquiry to one of our Montana livestock specialists. They'll follow up with you soon about ${finalPrimaryInterest || 'your needs'}.`
      : `Perfect! I've saved your information. One of our Montana Feed Company team members will reach out to you soon about ${finalPrimaryInterest || 'your inquiry'}.`;

    return res.status(200).json({
      result: responseMessage,
      lead_id: lead.id,
      specialist_assigned: !!assigned_specialist_id
    });

  } catch (error) {
    console.error('Error creating lead:', error);
    
    // ✅ VAPI-COMPATIBLE ERROR RESPONSE
    return res.status(200).json({ 
      result: "I apologize, but I had trouble saving your information. Could you please try again or call our main office at 406-683-2189?",
      error: true,
      error_details: error.message
    });
  }
};
