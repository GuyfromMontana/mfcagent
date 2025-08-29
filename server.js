// ============================================================================
// MONTANA FEED COMPANY AI VOICE AGENT API
// ============================================================================
// Deploy to: Railway
// Database: Supabase
// Voice: 11 Labs Integration
// ============================================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const multer = require('multer');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE AND CONFIGURATION
// ============================================================================

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Voice processing has higher limits
const voiceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60 // Allow more frequent voice calls
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Configure multer for audio file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Supabase client setup
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Standard response wrapper
const sendResponse = (res, data, message = 'Success', statusCode = 200) => {
  res.status(statusCode).json({
    success: statusCode < 400,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

// Error handler
const handleError = (res, error, message = 'Internal server error', statusCode = 500) => {
  console.error('API Error:', error);
  
  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    timestamp: new Date().toISOString()
  });
};

// Territory assignment helper
const assignTerritory = async (county, state = 'MT') => {
  try {
    const { data, error } = await supabase
      .from('territories')
      .select('territory_name, warehouse_location, lps_name, lps_email, lps_phone')
      .contains('counties_covered', { [state]: [county] })
      .eq('active', true)
      .single();

    if (error) {
      console.log('No territory found for:', county, state);
      return null;
    }
    return data;
  } catch (error) {
    console.error('Territory assignment error:', error);
    return null;
  }
};

// ============================================================================
// 11 LABS VOICE FUNCTIONS
// ============================================================================

// Generate speech from text using 11 Labs
async function generateSpeechWith11Labs(text, voiceSettings = {}) {
  try {
    const response = await axios({
      method: 'POST',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      data: {
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: voiceSettings.stability || 0.5,
          similarity_boost: voiceSettings.similarity_boost || 0.5,
          style: voiceSettings.style || 0.0,
          use_speaker_boost: voiceSettings.use_speaker_boost || true
        }
      },
      responseType: 'arraybuffer'
    });

    // Convert audio buffer to base64 for easy transmission
    const audioBuffer = Buffer.from(response.data);
    const audioBase64 = audioBuffer.toString('base64');
    
    return {
      audio_data: audioBase64,
      content_type: 'audio/mpeg',
      size: audioBuffer.length,
      duration_estimate: Math.ceil(text.length / 14) // Rough estimate: ~14 chars per second
    };
  } catch (error) {
    console.error('11 Labs TTS Error:', error.response?.data || error.message);
    throw new Error('Text-to-speech generation failed');
  }
}

// ============================================================================
// MONTANA FEED COMPANY BUSINESS LOGIC
// ============================================================================

// Unified Montana Feed Company response generator (works for both voice and text)
async function generateMontanaFeedResponse(message, customer, options = {}) {
  const lowerMessage = message.toLowerCase();
  const isVoice = options.isVoice || false;
  
  // Customer context
  const customerName = customer?.first_name || 'there';
  const territory = customer?.territory || 'your area';
  const county = customer?.county || 'your county';
  const operationType = customer?.operation_type || 'cattle operation';
  const herdSize = customer?.herd_size || 'your herd';

  let response = '';
  let scoreIncrease = 5;
  let topics = [];

  // Welcome/Greeting responses
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('good morning') || lowerMessage.includes('good afternoon')) {
    response = `Hello ${customerName}! Welcome to Montana Feed Company. I'm here to help you with better feed for better beef. 

Based on your location in ${county}, you're in our ${territory} territory, and we've got proven results on over 833,000 head of cattle.

What can I help you with today - are you looking for protein supplements, minerals, or do you have questions about your current feeding program?`;
    scoreIncrease = 8;
    topics = ['greeting', 'introduction'];
  }
  
  // Protein supplement inquiries
  else if (lowerMessage.includes('protein') || lowerMessage.includes('supplement') || lowerMessage.includes('tub')) {
    response = `Great question about protein supplements! For ${operationType} operations like yours, I typically recommend our Rangeland line.

The Rangeland 30-13 is very popular for range cattle - that's 30% protein and 13% fat. If you need more energy, the 24-12 High Fat works excellent for growing cattle or harsh weather conditions.

With ${herdSize} head, how are you currently supplementing them? And what challenges are you seeing with your current program?`;
    scoreIncrease = 15;
    topics = ['protein_supplements', 'product_inquiry'];
  }
  
  // Mineral inquiries
  else if (lowerMessage.includes('mineral') || lowerMessage.includes('wind rain') || lowerMessage.includes('salt')) {
    response = `Minerals are crucial for herd health! Our Wind & Rain Storm All Season 7.5 is our most popular - it's formulated specifically for year-round use and performs excellent in ${territory} conditions.

We also carry it with AV4 organic trace minerals for enhanced absorption, and we have options with Altosid for fly control if that's a concern in your area.

What's your current mineral program, and are you seeing any specific health or performance issues with your herd?`;
    scoreIncrease = 12;
    topics = ['minerals', 'herd_health'];
  }
  
  // Pricing inquiries
  else if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('expensive') || lowerMessage.includes('dollar')) {
    response = `I understand pricing is important for your operation. When you factor in our direct delivery service, the proven results we've documented, and the ongoing support from your LPS specialist, our total cost per pound of gain is very competitive.

Let me get some details so I can give you accurate numbers. What products are you most interested in, and what kind of quantities are we talking about for your ${herdSize} head operation?

We also work with Purina Finance and John Deere Credit if financing would help with cash flow.`;
    scoreIncrease = 25; // High score for pricing discussion
    topics = ['pricing', 'financing'];
  }
  
  // Delivery inquiries
  else if (lowerMessage.includes('delivery') || lowerMessage.includes('truck') || lowerMessage.includes('shipping')) {
    response = `We deliver right to your ranch by the ton with our own trucks. Our stinger trucks can go directly into your bins, which saves you time and keeps your feed fresh.

From our ${territory} warehouse, we cover all the area efficiently. For bagged products, we deliver by the pallet or ton. You can also arrange pallet pickup with 48 hours notice if that works better.

What type of products are you looking at, and what's your typical feeding schedule? I can help set up regular deliveries so you never run short.`;
    scoreIncrease = 10;
    topics = ['delivery', 'logistics'];
  }
  
  // Specific product mentions
  else if (lowerMessage.includes('rangeland') || lowerMessage.includes('accuration')) {
    response = `You're asking about some of our most popular products! Let me tell you what works well for operations like yours.

The Rangeland line has been proven on thousands of head. For cow-calf operations, the 30-13 provides excellent protein for breeding and lactating cows. The 24-12 High Fat is great when cattle need extra energy during cold weather or poor pasture conditions.

Our Wind & Rain minerals are essential - they prevent grass tetany and provide the trace minerals cattle need that they can't get from grass alone.

Which specific challenge are you trying to address with your herd? Better conception rates, weight gain, or overall health?`;
    scoreIncrease = 20;
    topics = ['specific_products', 'product_knowledge'];
  }
  
  // Operation type questions
  else if (lowerMessage.includes('cow calf') || lowerMessage.includes('stocker') || lowerMessage.includes('finishing')) {
    const opType = lowerMessage.includes('cow calf') ? 'cow-calf' : 
                  lowerMessage.includes('stocker') ? 'stocker' : 'finishing';
    
    response = `${opType} operations have specific nutritional needs. For ${opType}, I typically recommend focusing on ${opType === 'cow-calf' ? 'breeding nutrition and mineral supplements to maximize conception rates' : 
    opType === 'stocker' ? 'protein supplements to maximize gain on grass' : 
    'high-energy feeds to optimize feed conversion'}.

Based on your ${herdSize} head, what's your biggest challenge right now? Are you seeing the performance you want, or are there areas where we could help improve your results?

Our LPS specialist ${customer?.lps_specialist_name || 'in your territory'} has worked with many ${opType} operations and could visit your ranch to do a complete assessment.`;
    scoreIncrease = 15;
    topics = ['operation_type', 'consultation'];
  }
  
  // General inquiry or unclear
  else {
    response = `I want to make sure I understand exactly what you need help with. 

We specialize in nutrition programs for cattle operations - everything from protein tubs and minerals to custom blended feeds. We've got proven results on 833,997 head of cattle and can deliver right to your ranch.

Could you tell me a bit more about your operation? What type of cattle are you running, and what's your biggest challenge with your current feeding program?

I'm here to help you get better performance from your herd with the right Purina products.`;
    scoreIncrease = 5;
    topics = ['general_inquiry'];
  }

  // Return appropriate format based on context
  if (isVoice || options.returnExtended) {
    return {
      text: response,
      score_increase: scoreIncrease,
      topics: topics
    };
  } else {
    return response; // For backward compatibility with existing endpoints
  }
}

// ============================================================================
// HEALTH CHECK AND SYSTEM STATUS
// ============================================================================

app.get('/health', async (req, res) => {
  try {
    // Check Supabase connection
    const { data, error } = await supabase
      .from('customers')
      .select('count')
      .limit(1);

    if (error) throw error;

    sendResponse(res, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      voice_integration: process.env.ELEVENLABS_API_KEY ? 'configured' : 'not_configured',
      version: '1.0.0'
    });
  } catch (error) {
    handleError(res, error, 'Health check failed', 503);
  }
});

// Basic system info
app.get('/', (req, res) => {
  sendResponse(res, {
    service: 'Montana Feed Company Voice Agent API',
    version: '1.0.0',
    status: 'running',
    voice_enabled: !!process.env.ELEVENLABS_API_KEY,
    endpoints: {
      health: '/health',
      customer_lookup: '/api/auth/lookup',
      products: '/api/products/search',
      conversations: '/api/conversations/start',
      voice_test: '/api/voice/test',
      voice_conversation: '/api/voice/conversation'
    }
  }, 'Montana Feed Company Voice Agent API is running');
});

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

// Customer lookup (for returning customers)
app.get('/api/auth/lookup', async (req, res) => {
  try {
    const { phone, email } = req.query;

    if (!phone && !email) {
      return handleError(res, new Error('Phone or email required'), 'Phone or email required', 400);
    }

    let query = supabase.from('customers').select('*');
    
    if (phone) {
      query = query.eq('phone', phone);
    } else if (email) {
      query = query.eq('email', email);
    }

    const { data: customer, error } = await query.single();

    if (error && error.code === 'PGRST116') {
      return sendResponse(res, null, 'Customer not found', 404);
    }

    if (error) throw error;

    sendResponse(res, { customer }, 'Customer found');
  } catch (error) {
    handleError(res, error, 'Lookup failed');
  }
});

// Customer registration/login
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, phone, first_name, last_name, ranch_name, county, state = 'MT' } = req.body;

    // Check if customer exists
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, email')
      .eq('email', email)
      .single();

    if (existingCustomer) {
      return sendResponse(res, { customer_id: existingCustomer.id }, 'Customer already exists', 200);
    }

    // Assign territory based on county
    const territory = await assignTerritory(county, state);

    // Create new customer
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        email,
        phone,
        first_name,
        last_name,
        ranch_name,
        county,
        state,
        territory: territory?.territory_name,
        warehouse_location: territory?.warehouse_location,
        lps_specialist_name: territory?.lps_name,
        lps_specialist_email: territory?.lps_email,
        lps_specialist_phone: territory?.lps_phone,
        customer_status: 'prospect'
      })
      .select()
      .single();

    if (error) throw error;

    sendResponse(res, { customer: customer }, 'Customer registered successfully', 201);
  } catch (error) {
    handleError(res, error, 'Registration failed', 400);
  }
});

// ============================================================================
// CONVERSATION ENDPOINTS
// ============================================================================

// Start new conversation
app.post('/api/conversations/start', async (req, res) => {
  try {
    const { 
      customer_id, 
      channel, 
      phone_number, 
      session_id,
      detected_location 
    } = req.body;

    // Generate session ID if not provided
    const finalSessionId = session_id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        customer_id,
        session_id: finalSessionId,
        channel,
        phone_number,
        detected_location,
        status: 'active',
        transcript: [],
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // If customer provided, get their details for context
    let customerContext = null;
    if (customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('first_name, last_name, ranch_name, operation_type, herd_size, county, territory, lps_specialist_name')
        .eq('id', customer_id)
        .single();
      
      customerContext = customer;
    }

    sendResponse(res, {
      conversation_id: conversation.id,
      session_id: finalSessionId,
      customer_context: customerContext
    }, 'Conversation started', 201);

  } catch (error) {
    handleError(res, error, 'Failed to start conversation');
  }
});

// Process text conversation input
app.post('/api/conversations/process-voice', async (req, res) => {
  try {
    const { 
      conversation_id, 
      message, 
      speaker = 'customer' 
    } = req.body;

    // Get conversation context
    const { data: conversation } = await supabase
      .from('conversations')
      .select('*, customers(*)')
      .eq('id', conversation_id)
      .single();

    if (!conversation) {
      return handleError(res, new Error('Conversation not found'), 'Conversation not found', 404);
    }

    // Add message to conversation
    const messageIndex = (conversation.transcript || []).length;
    
    await supabase
      .from('conversation_messages')
      .insert({
        conversation_id,
        message_index: messageIndex,
        speaker,
        content: message
      });

    // Update conversation transcript
    const updatedTranscript = [...(conversation.transcript || []), {
      speaker,
      message,
      timestamp: new Date().toISOString()
    }];

    // Generate Montana Feed Company response
    let agentResponse = '';
    let leadScore = conversation.lead_score || 0;
    
    if (speaker === 'customer') {
      const customer = conversation.customers;
      agentResponse = await generateMontanaFeedResponse(message, customer);
      leadScore += 5; // Basic scoring for text conversations
    }

    // Update conversation
    await supabase
      .from('conversations')
      .update({
        transcript: updatedTranscript,
        lead_score: leadScore,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversation_id);

    sendResponse(res, {
      agent_response: agentResponse,
      lead_score: leadScore
    });

  } catch (error) {
    handleError(res, error, 'Failed to process conversation input');
  }
});

// ============================================================================
// VOICE ENDPOINTS
// ============================================================================

// Generate speech from text using 11 Labs
app.post('/api/voice/generate-speech', voiceLimiter, async (req, res) => {
  try {
    const { text, voice_settings = {} } = req.body;

    if (!text) {
      return handleError(res, new Error('Text is required'), 'Text is required for speech generation', 400);
    }

    if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
      return handleError(res, new Error('11 Labs not configured'), '11 Labs API credentials not configured', 500);
    }

    // Generate speech with 11 Labs
    const speechResult = await generateSpeechWith11Labs(text, voice_settings);

    sendResponse(res, {
      audio_data: speechResult.audio_data,
      content_type: speechResult.content_type,
      text: text,
      duration_estimate: speechResult.duration_estimate,
      voice_id: process.env.ELEVENLABS_VOICE_ID
    }, 'Speech generated successfully');

  } catch (error) {
    handleError(res, error, 'Failed to generate speech');
  }
});

// Start or continue voice conversation
app.post('/api/voice/conversation', voiceLimiter, async (req, res) => {
  try {
    const {
      conversation_id,
      customer_message,
      customer_phone,
      detected_location,
      voice_confidence = 0.95
    } = req.body;

    let conversation;
    let customer = null;

    // Get or create conversation
    if (conversation_id) {
      const { data } = await supabase
        .from('conversations')
        .select('*, customers(*)')
        .eq('id', conversation_id)
        .single();
      conversation = data;
      customer = data?.customers;
    } else {
      // Start new conversation
      if (customer_phone) {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('*')
          .eq('phone', customer_phone)
          .single();
        customer = existingCustomer;
      }

      const sessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const { data: newConversation } = await supabase
        .from('conversations')
        .insert({
          session_id: sessionId,
          customer_id: customer?.id,
          channel: 'voice',
          phone_number: customer_phone,
          detected_location,
          status: 'active',
          transcript: [],
          voice_model_used: process.env.ELEVENLABS_VOICE_ID
        })
        .select()
        .single();

      conversation = newConversation;
    }

    // Add customer message to conversation
    const messageIndex = (conversation.transcript || []).length;
    
    await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversation.id,
        message_index: messageIndex,
        speaker: 'customer',
        content: customer_message,
        voice_confidence: voice_confidence
      });

    // Generate Montana Feed Company response
    const agentResponse = await generateMontanaFeedResponse(
      customer_message, 
      customer, 
      { isVoice: true, returnExtended: true }
    );

    // Update conversation with new messages
    const updatedTranscript = [...(conversation.transcript || []), 
      {
        speaker: 'customer',
        message: customer_message,
        timestamp: new Date().toISOString(),
        confidence: voice_confidence
      },
      {
        speaker: 'agent',
        message: agentResponse.text,
        timestamp: new Date().toISOString()
      }
    ];

    // Calculate lead score based on conversation
    let leadScore = conversation.lead_score || 0;
    leadScore += agentResponse.score_increase || 5;

    await supabase
      .from('conversations')
      .update({
        transcript: updatedTranscript,
        lead_score: leadScore,
        topics_discussed: agentResponse.topics,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversation.id);

    // Generate speech for agent response
    const speechResult = await generateSpeechWith11Labs(agentResponse.text);

    sendResponse(res, {
      conversation_id: conversation.id,
      agent_response: {
        text: agentResponse.text,
        audio_data: speechResult.audio_data,
        content_type: speechResult.content_type,
        duration_estimate: speechResult.duration_estimate
      },
      customer_context: customer ? {
        name: `${customer.first_name} ${customer.last_name}`,
        ranch_name: customer.ranch_name,
        territory: customer.territory,
        operation_type: customer.operation_type,
        herd_size: customer.herd_size
      } : null,
      lead_score: leadScore,
      conversation_status: 'active'
    }, 'Voice conversation processed');

  } catch (error) {
    handleError(res, error, 'Failed to process voice conversation');
  }
});

// End voice conversation
app.post('/api/voice/end-conversation', async (req, res) => {
  try {
    const { conversation_id, summary } = req.body;

    if (!conversation_id) {
      return handleError(res, new Error('Conversation ID required'), 'Conversation ID required', 400);
    }

    const endTime = new Date().toISOString();
    
    const { data: conversation } = await supabase
      .from('conversations')
      .update({
        status: 'completed',
        ended_at: endTime,
        summary: summary || 'Voice conversation completed'
      })
      .eq('id', conversation_id)
      .select()
      .single();

    // Calculate duration
    const duration = conversation.ended_at && conversation.started_at 
      ? Math.floor((new Date(conversation.ended_at) - new Date(conversation.started_at)) / 1000)
      : 0;

    await supabase
      .from('conversations')
      .update({ duration_seconds: duration })
      .eq('id', conversation_id);

    // Auto-create lead if score is high enough
    if ((conversation.lead_score || 0) >= 40) {
      await createLeadFromVoiceConversation(conversation);
    }

    sendResponse(res, {
      conversation_id: conversation_id,
      duration_seconds: duration,
      final_score: conversation.lead_score,
      lead_created: (conversation.lead_score || 0) >= 40
    }, 'Voice conversation ended');

  } catch (error) {
    handleError(res, error, 'Failed to end voice conversation');
  }
});

// Voice integration test endpoint
app.post('/api/voice/test', async (req, res) => {
  try {
    const { test_message = "Hello, I'm interested in protein supplements for my cattle." } = req.body;

    // Test 11 Labs configuration
    if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
      return handleError(res, new Error('11 Labs not configured'), 
        'Please add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID to environment variables', 500);
    }

    // Generate test response
    const testResponse = await generateMontanaFeedResponse(
      test_message, 
      null, // No customer context
      { isVoice: true, returnExtended: true }
    );

    // Generate speech
    const speechResult = await generateSpeechWith11Labs(testResponse.text);

    sendResponse(res, {
      input_message: test_message,
      agent_response: {
        text: testResponse.text,
        audio_data: speechResult.audio_data,
        content_type: speechResult.content_type,
        duration_estimate: speechResult.duration_estimate
      },
      score_increase: testResponse.score_increase,
      topics: testResponse.topics,
      voice_id: process.env.ELEVENLABS_VOICE_ID
    }, '11 Labs voice integration test successful');

  } catch (error) {
    handleError(res, error, 'Voice integration test failed');
  }
});

// ============================================================================
// CUSTOMER ENDPOINTS
// ============================================================================

// Get customer profile
app.get('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    sendResponse(res, { customer });
  } catch (error) {
    handleError(res, error, 'Failed to get customer');
  }
});

// ============================================================================
// PRODUCT ENDPOINTS
// ============================================================================

// Search products
app.get('/api/products/search', async (req, res) => {
  try {
    const { 
      query, 
      category, 
      territory, 
      limit = 20 
    } = req.query;

    let dbQuery = supabase
      .from('products')
      .select('*')
      .eq('active', true);

    if (query) {
      dbQuery = dbQuery.ilike('name', `%${query}%`);
    }

    if (category) {
      dbQuery = dbQuery.eq('category', category);
    }

    if (territory) {
      dbQuery = dbQuery.contains('available_territories', [territory]);
    }

    const { data: products, error } = await dbQuery
      .limit(limit)
      .order('recommended', { ascending: false });

    if (error) throw error;

    sendResponse(res, { products });
  } catch (error) {
    handleError(res, error, 'Failed to search products');
  }
});

// Get product recommendations based on operation
app.post('/api/products/recommend', async (req, res) => {
  try {
    const { 
      operation_type, 
      herd_size, 
      territory
    } = req.body;

    // Basic recommendation logic
    let categoryPriorities = [];
    
    switch (operation_type) {
      case 'cow-calf':
        categoryPriorities = ['Loose Minerals', 'Protein Tubs'];
        break;
      case 'stockers':
        categoryPriorities = ['Protein Tubs', 'Bulk Feeds'];
        break;
      case 'finishing':
        categoryPriorities = ['Bulk Feeds'];
        break;
      default:
        categoryPriorities = ['Protein Tubs', 'Loose Minerals'];
    }

    const recommendations = [];
    
    for (const category of categoryPriorities) {
      const { data: products } = await supabase
        .from('products')
        .select('*')
        .eq('category', category)
        .eq('active', true)
        .limit(3);

      if (products) {
        recommendations.push(...products);
      }
    }

    sendResponse(res, { 
      recommendations: recommendations.slice(0, 6),
      reasoning: `Recommended for ${operation_type} operations`
    });

  } catch (error) {
    handleError(res, error, 'Failed to get product recommendations');
  }
});

// ============================================================================
// TERRITORIES ENDPOINT
// ============================================================================

// Get all territories
app.get('/api/territories', async (req, res) => {
  try {
    const { data: territories, error } = await supabase
      .from('territories')
      .select('*')
      .eq('active', true)
      .order('territory_name');

    if (error) throw error;

    sendResponse(res, { territories });
  } catch (error) {
    handleError(res, error, 'Failed to get territories');
  }
});

// ============================================================================
// SYSTEM METRICS
// ============================================================================

// Get system metrics
app.get('/api/metrics', async (req, res) => {
  try {
    const [
      { count: totalConversations },
      { count: activeConversations },
      { count: totalCustomers },
      { count: totalProducts }
    ] = await Promise.all([
      supabase.from('conversations').select('*', { count: 'exact', head: true }),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('customers').select('*', { count: 'exact', head: true }),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true)
    ]);

    sendResponse(res, {
      conversations: {
        total: totalConversations || 0,
        active: activeConversations || 0
      },
      customers: totalCustomers || 0,
      products: totalProducts || 0,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0',
        voice_enabled: !!process.env.ELEVENLABS_API_KEY
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to get metrics');
  }
});

// ============================================================================
// LEAD MANAGEMENT FUNCTIONS
// ============================================================================

// Create lead from high-scoring voice conversation
async function createLeadFromVoiceConversation(conversation) {
  try {
    // Extract topics and interests from conversation
    const topics = conversation.topics_discussed || [];
    const productInterest = topics.filter(t => 
      ['protein_supplements', 'minerals', 'specific_products'].includes(t)
    );

    await supabase.from('leads').insert({
      conversation_id: conversation.id,
      customer_id: conversation.customer_id,
      source: 'voice_agent',
      lead_type: 'voice_inquiry',
      priority: conversation.lead_score > 60 ? 'high' : 'medium',
      product_interest: productInterest,
      total_score: conversation.lead_score,
      initial_notes: `Voice conversation summary: ${conversation.summary}`,
      follow_up_date: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
    });

    console.log(`Lead created from voice conversation ${conversation.id} with score ${conversation.lead_score}`);
  } catch (error) {
    console.error('Failed to create lead from voice conversation:', error);
  }
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 Montana Feed Company API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎤 Voice integration: ${process.env.ELEVENLABS_API_KEY ? 'Enabled' : 'Disabled'}`);
  
  // Test database connection on startup
  supabase
    .from('customers')
    .select('count')
    .limit(1)
    .then(({ data, error }) => {
      if (error) {
        console.error('❌ Database connection failed:', error.message);
      } else {
        console.log('✅ Database connection successful');
      }
    });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;



