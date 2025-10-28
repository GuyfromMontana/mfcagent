// API Endpoint: /api/create-lead
// Creates a new lead in the system - VAPI COMPATIBLE VERSION WITH DETAILED LOGGING
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // 🔍 LOGGING: Log the entire request
  console.log('=== CREATE LEAD REQUEST RECEIVED ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Query:', JSON.stringify(req.query, null, 2));

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // 🔍 LOGGING: Log environment check
    console.log('Supabase URL:', process.env.SUPABASE_URL ? 'Present' : 'MISSING');
    console.log('Service Key:', process.env.SUPABASE_SERVICE_KEY ? 'Present' : 'MISSING');

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

    // 🔍 LOGGING: Log what we received
    console.log('=== EXTRACTED PARAMETERS ===');
    console.log('name:', name);
    console.log('first_name:', first_name);
    console.log('last_name:', last_name);
    console.log('phone:', phone);
    console.log('email:', email);
    console.log('county:', county);
    console.log('notes:', notes);
    console.log('primary_interest:', primary_interest);

    // Parse name into first_name and last_name if provided as single field
    let finalFirstName = first_name;
    let finalLastName = last_name;
    
    if (name && !first_name && !last_name) {
      // Split "Guy Hanson" into "Guy" and "Hanson"
      const nameParts = name.trim().split(/\s+/);
      finalFirstName = nameParts[0] || null;
      finalLastName = nameParts.slice(1).join(' ') || null;
      
      // 🔍 LOGGING: Log name parsing
      console.log('=== NAME PARSING ===');
      console.log('Original name:', name);
      console.log('Parsed first_name:', finalFirstName);
      console.log('Parsed last_name:', finalLastName);
    }

    // Use notes if primary_interest not provided
    const finalPrimaryInterest = primary_interest || notes;

    // Find territory
    let territory_id = null;
    if (county) {
      console.log('=== TERRITORY LOOKUP ===');
      console.log('Looking up territory for county:', county);
      
      const { data, error: territoryError } = await supabase
        .from('territories')
        .select('id')
        .contains('counties', [county])
        .limit(1);
      
      if (territoryError) {
        console.error('Territory lookup error:', territoryError);
      } else {
        console.log('Territory lookup result:', data);
        if (data && data.length > 0) territory_id = data[0].id;
      }
    }

    // Find specialist
    let assigned_specialist_id = null;
    if (territory_id) {
      console.log('=== SPECIALIST LOOKUP ===');
      console.log('Looking up specialist for territory_id:', territory_id);
      
      const { data, error: specialistError } = await supabase
        .from('specialists')
        .select('id')
        .eq('territory_id', territory_id)
        .eq('is_active', true)
        .limit(1);
      
      if (specialistError) {
        console.error('Specialist lookup error:', specialistError);
      } else {
        console.log('Specialist lookup result:', data);
        if (data && data.length > 0) assigned_specialist_id = data[0].id;
      }
    }

    // 🔍 LOGGING: Log what we're about to insert
    console.log('=== PREPARING TO INSERT LEAD ===');
    const leadData = {
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
    };
    console.log('Lead data to insert:', JSON.stringify(leadData, null, 2));

    // Create lead
    const { data: lead, error } = await supabase
      .from('leads')
      .insert(leadData)
      .select()
      .single();

    if (error) {
      console.error('=== INSERT ERROR ===');
      console.error('Error details:', JSON.stringify(error, null, 2));
      throw error;
    }

    // 🔍 LOGGING: Log successful insert
    console.log('=== INSERT SUCCESS ===');
    console.log('Created lead:', JSON.stringify(lead, null, 2));

    // ✅ VAPI-COMPATIBLE RESPONSE FORMAT
    // Return a simple message that Vapi can use in the conversation
    const responseMessage = assigned_specialist_id 
      ? `Great! I've saved your information and assigned your inquiry to one of our Montana livestock specialists. They'll follow up with you soon about ${finalPrimaryInterest || 'your needs'}.`
      : `Perfect! I've saved your information. One of our Montana Feed Company team members will reach out to you soon about ${finalPrimaryInterest || 'your inquiry'}.`;

    const response = {
      result: responseMessage,
      lead_id: lead.id,
      specialist_assigned: !!assigned_specialist_id
    };

    // 🔍 LOGGING: Log response
    console.log('=== SENDING RESPONSE ===');
    console.log('Response:', JSON.stringify(response, null, 2));

    return res.status(200).json(response);

  } catch (error) {
    console.error('=== CAUGHT ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error:', JSON.stringify(error, null, 2));
    
    // ✅ VAPI-COMPATIBLE ERROR RESPONSE
    const errorResponse = { 
      result: "I apologize, but I had trouble saving your information. Could you please try again or call our main office at 406-683-2189?",
      error: true,
      error_details: error.message
    };

    console.log('Sending error response:', JSON.stringify(errorResponse, null, 2));
    
    return res.status(200).json(errorResponse);
  }
};
