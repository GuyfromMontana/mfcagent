// API Endpoint: /api/create-lead
// Creates a new lead in the system

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

    const {
      first_name,
      last_name,
      phone,
      email,
      ranch_name,
      county,
      zip_code,
      livestock_types,
      herd_size,
      primary_interest,
      conversation_id
    } = req.body;

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
        first_name,
        last_name,
        phone,
        email,
        ranch_name,
        zip_code,
        territory_id,
        assigned_specialist_id,
        livestock_types,
        herd_size,
        primary_interest,
        lead_source: 'Voice Agent Call',
        lead_status: 'new',
        initial_conversation_id: conversation_id,
        follow_up_required: true
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      lead_id: lead.id,
      message: 'Lead created successfully',
      assigned_specialist: assigned_specialist_id ? 'Assigned to territory specialist' : 'Pending assignment'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
