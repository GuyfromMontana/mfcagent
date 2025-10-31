// API Endpoint: /api/create-lead
// Creates lead and sends email notifications via Resend
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  console.log('=== CREATE LEAD REQUEST RECEIVED ===');
  console.log('Method:', req.method);
  console.log('Full body:', JSON.stringify(req.body, null, 2));

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Extract parameters from Vapi's request
    let params = {};
    
    if (req.body?.message?.toolCalls?.[0]?.function?.arguments) {
      params = req.body.message.toolCalls[0].function.arguments;
      console.log('✅ Extracted from Vapi format');
    } else if (req.body?.message?.toolWithToolCallList?.[0]?.toolCall?.function?.arguments) {
      params = req.body.message.toolWithToolCallList[0].toolCall.function.arguments;
      console.log('✅ Extracted from alternative Vapi format');
    } else {
      params = req.body || {};
      console.log('✅ Using direct body format');
    }

    console.log('Extracted params:', JSON.stringify(params, null, 2));

    // Extract individual fields
    const {
      name,           
      first_name,     
      last_name,      
      phone,
      email,
      ranch_name,
      county,
      zip_code,
      livestock_types,
      herd_size,
      notes,          
      primary_interest,
      conversation_id
    } = params;

    console.log('=== EXTRACTED PARAMETERS ===');
    console.log('name:', name);
    console.log('first_name:', first_name);
    console.log('last_name:', last_name);
    console.log('phone:', phone);
    console.log('email:', email);
    console.log('county (raw):', county);
    console.log('notes:', notes);
    console.log('primary_interest:', primary_interest);

    // Parse name into first_name and last_name if provided as single field
    let finalFirstName = first_name;
    let finalLastName = last_name;
    
    if (name && !first_name && !last_name) {
      const nameParts = name.trim().split(/\s+/);
      finalFirstName = nameParts[0] || null;
      finalLastName = nameParts.slice(1).join(' ') || null;
      
      console.log('=== NAME PARSING ===');
      console.log('Original name:', name);
      console.log('Parsed first_name:', finalFirstName);
      console.log('Parsed last_name:', finalLastName);
    }

    // Strip "County" from county name for database lookup
    let countyForLookup = county;
    if (county) {
      countyForLookup = county.replace(/\s+county\s*$/i, '').trim();
      console.log('=== COUNTY NAME NORMALIZATION ===');
      console.log('Original county:', county);
      console.log('Normalized county for lookup:', countyForLookup);
    }

    // Use notes if primary_interest not provided
    const finalPrimaryInterest = primary_interest || notes;

    // Find territory with full details
    let territory_id = null;
    let territoryDetails = null;
    if (countyForLookup) {
      console.log('=== TERRITORY LOOKUP ===');
      console.log('Looking up territory for county:', countyForLookup);
      
      const { data, error: territoryError } = await supabase
        .from('territories')
        .select('*')
        .contains('counties', [countyForLookup])
        .limit(1);
      
      if (territoryError) {
        console.error('Territory lookup error:', territoryError);
      } else {
        console.log('Territory lookup result:', data);
        if (data && data.length > 0) {
          territory_id = data[0].id;
          territoryDetails = data[0];
          console.log('✅ Found territory:', territoryDetails);
        } else {
          console.log('⚠️ No territory found for county:', countyForLookup);
        }
      }
    }

    // Find specialist with full details
    let assigned_specialist_id = null;
    let specialistDetails = null;
    if (territory_id) {
      console.log('=== SPECIALIST LOOKUP ===');
      console.log('Looking up specialist for territory_id:', territory_id);
      
      const { data, error: specialistError } = await supabase
        .from('specialists')
        .select('*')
        .eq('territory_id', territory_id)
        .eq('is_active', true)
        .limit(1);
      
      if (specialistError) {
        console.error('Specialist lookup error:', specialistError);
      } else {
        console.log('Specialist lookup result:', data);
        if (data && data.length > 0) {
          assigned_specialist_id = data[0].id;
          specialistDetails = data[0];
          console.log('✅ Found specialist:', specialistDetails);
        }
      }
    }

    // Find warehouse manager (specialist with "warehouse operations" in specialties)
    let warehouseManagerDetails = null;
    if (territory_id) {
      console.log('=== WAREHOUSE MANAGER LOOKUP ===');
      console.log('Looking for warehouse operations specialist in territory_id:', territory_id);
      
      const { data, error: managerError } = await supabase
        .from('specialists')
        .select('*')
        .eq('territory_id', territory_id)
        .eq('is_active', true)
        .contains('specialties', ['warehouse operations'])
        .limit(1);
      
      if (managerError) {
        console.error('Warehouse manager lookup error:', managerError);
      } else {
        console.log('Warehouse manager lookup result:', data);
        if (data && data.length > 0) {
          warehouseManagerDetails = data[0];
          console.log('✅ Found warehouse manager:', warehouseManagerDetails);
        } else {
          console.log('⚠️ No warehouse manager found for territory');
        }
      }
    }

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

    console.log('=== INSERT SUCCESS ===');
    console.log('Created lead:', JSON.stringify(lead, null, 2));

    // 📧 SEND EMAIL NOTIFICATIONS
    console.log('=== SENDING EMAIL NOTIFICATIONS ===');
    
    try {
      // Initialize Resend
      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailRecipients = [];
      
      // Add specialist email if available
      if (specialistDetails?.email) {
        emailRecipients.push({
          email: specialistDetails.email,
          name: `${specialistDetails.first_name} ${specialistDetails.last_name}`,
          role: 'Livestock Specialist'
        });
        console.log('📧 Will email specialist:', specialistDetails.email);
      }
      
      // Add warehouse manager email if available (and different from specialist)
      if (warehouseManagerDetails?.email && warehouseManagerDetails.email !== specialistDetails?.email) {
        emailRecipients.push({
          email: warehouseManagerDetails.email,
          name: `${warehouseManagerDetails.first_name} ${warehouseManagerDetails.last_name}`,
          role: 'Warehouse Manager'
        });
        console.log('📧 Will email warehouse manager:', warehouseManagerDetails.email);
      }

      // If no recipients found, send to fallback email
      if (emailRecipients.length === 0) {
        const fallbackEmail = process.env.MANAGER_EMAIL || 'guy@axmen.com';
        emailRecipients.push({
          email: fallbackEmail,
          name: 'Management',
          role: 'Fallback Manager'
        });
        console.log('📧 No specialist/manager found, using fallback:', fallbackEmail);
      }

      // Prepare email content
      const leadName = `${finalFirstName || ''} ${finalLastName || ''}`.trim() || 'Unknown';
      const territoryName = territoryDetails?.territory_name || 'Unassigned';
      const specialistName = specialistDetails 
        ? `${specialistDetails.first_name} ${specialistDetails.last_name}`
        : 'Not Assigned';

      const emailSubject = `🎯 New Lead: ${leadName} in ${countyForLookup || 'Unknown'} County`;
      
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2c5530; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .field { margin: 10px 0; }
    .label { font-weight: bold; color: #2c5530; }
    .value { margin-left: 10px; }
    .footer { margin-top: 20px; padding: 15px; background-color: #f0f0f0; border-radius: 5px; font-size: 12px; color: #666; }
    .priority { background-color: #fff3cd; padding: 10px; border-left: 4px solid #ffc107; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🎯 New Lead from Voice Agent</h2>
    </div>
    
    <div class="content">
      <div class="priority">
        <strong>⚡ Action Required:</strong> New lead needs follow-up within 24 hours
      </div>

      <h3>Contact Information</h3>
      <div class="field">
        <span class="label">Name:</span>
        <span class="value">${leadName}</span>
      </div>
      <div class="field">
        <span class="label">Phone:</span>
        <span class="value">${phone || 'Not provided'}</span>
      </div>
      <div class="field">
        <span class="label">Email:</span>
        <span class="value">${email || 'Not provided'}</span>
      </div>
      <div class="field">
        <span class="label">Ranch Name:</span>
        <span class="value">${ranch_name || 'Not provided'}</span>
      </div>

      <h3>Location & Assignment</h3>
      <div class="field">
        <span class="label">County:</span>
        <span class="value">${countyForLookup || 'Not provided'}</span>
      </div>
      <div class="field">
        <span class="label">Territory:</span>
        <span class="value">${territoryName}</span>
      </div>
      <div class="field">
        <span class="label">Assigned Specialist:</span>
        <span class="value">${specialistName}</span>
      </div>

      <h3>Lead Details</h3>
      <div class="field">
        <span class="label">Primary Interest:</span>
        <span class="value">${finalPrimaryInterest || 'Not specified'}</span>
      </div>
      <div class="field">
        <span class="label">Herd Size:</span>
        <span class="value">${herd_size || 'Not provided'}</span>
      </div>
      <div class="field">
        <span class="label">Livestock Types:</span>
        <span class="value">${livestock_types || 'Not provided'}</span>
      </div>
      <div class="field">
        <span class="label">Lead Source:</span>
        <span class="value">Voice Agent Call</span>
      </div>
      <div class="field">
        <span class="label">Lead ID:</span>
        <span class="value">${lead.id}</span>
      </div>
    </div>

    <div class="footer">
      <p><strong>Next Steps:</strong></p>
      <ul>
        <li>Follow up within 24 hours</li>
        <li>Review the customer's interest in: ${finalPrimaryInterest || 'products/services'}</li>
        <li>Access full lead details in your CRM dashboard</li>
      </ul>
      <p style="margin-top: 15px; font-size: 11px;">
        This is an automated notification from Montana Feed Company Voice Agent System.<br>
        Lead created: ${new Date(lead.created_at).toLocaleString()}
      </p>
    </div>
  </div>
</body>
</html>
`;

      // Send emails to all recipients
      const emailPromises = emailRecipients.map(async (recipient) => {
        try {
          console.log(`📧 Sending email to ${recipient.role}: ${recipient.email}`);
          
          const { data, error } = await resend.emails.send({
            from: 'Montana Feed Company <leads@axmen.com>',
            to: recipient.email,
            subject: emailSubject,
            html: emailHtml
          });

          if (error) {
            console.error(`❌ Email error for ${recipient.email}:`, error);
            return { success: false, recipient, error };
          }

          console.log(`✅ Email sent successfully to ${recipient.email}`);
          return { success: true, recipient, data };
        } catch (err) {
          console.error(`❌ Exception sending email to ${recipient.email}:`, err);
          return { success: false, recipient, error: err.message };
        }
      });

      const emailResults = await Promise.all(emailPromises);
      console.log('=== EMAIL RESULTS ===');
      console.log(JSON.stringify(emailResults, null, 2));

    } catch (emailError) {
      // Don't fail the lead creation if emails fail
      console.error('=== EMAIL SENDING ERROR ===');
      console.error('Error:', emailError);
      console.log('⚠️ Lead created successfully but email notifications failed');
    }

    // VAPI-COMPATIBLE RESPONSE FORMAT
    const responseMessage = assigned_specialist_id 
      ? `Great! I've saved your information and assigned your inquiry to one of our Montana livestock specialists. They'll follow up with you soon about ${finalPrimaryInterest || 'your needs'}.`
      : `Perfect! I've saved your information. One of our Montana Feed Company team members will reach out to you soon about ${finalPrimaryInterest || 'your inquiry'}.`;

    const response = {
      result: responseMessage,
      lead_id: lead.id,
      specialist_assigned: !!assigned_specialist_id
    };

    console.log('=== SENDING RESPONSE ===');
    console.log('Response:', JSON.stringify(response, null, 2));

    return res.status(200).json(response);

  } catch (error) {
    console.error('=== CAUGHT ERROR ===');
    console.error('Error:', error);
    
    const errorResponse = { 
      result: "I apologize, but I had trouble saving your information. Could you please try again or call our main office at 406-683-2189?",
      error: true,
      error_details: error.message
    };

    console.log('Sending error response:', JSON.stringify(errorResponse, null, 2));
    
    return res.status(200).json(errorResponse);
  }
};