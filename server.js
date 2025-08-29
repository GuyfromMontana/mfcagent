// ============================================================================
// MONTANA FEED COMPANY AI VOICE AGENT API
// ============================================================================
// Deploy to: Railway
// Database: Supabase
// ============================================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
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

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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
    endpoints: {
      health: '/health',
      customer_lookup: '/api/auth/lookup',
      products: '/api/products/search',
      conversations: '/api/conversations/start'
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

// Process voice input (simplified for initial deployment)
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

    // Basic Montana Feed Company response logic
    let agentResponse = '';
    let leadScore = conversation.lead_score || 0;
    
    if (speaker === 'customer') {
      const customer = conversation.customers;
      agentResponse = await generateMontanaFeedResponse(message, customer);
      leadScore += 5; // Basic scoring
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
    handleError(res, error, 'Failed to process voice input');
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
        version: '1.0.0'
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to get metrics');
  }
});

// ============================================================================
// MONTANA FEED COMPANY BUSINESS LOGIC
// ============================================================================

async function generateMontanaFeedResponse(message, customer) {
  const customerName = customer?.first_name || 'there';
  const territory = customer?.territory || 'your area';
  const county = customer?.county || 'your county';
  
  // Basic keyword-based responses
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('protein') || lowerMessage.includes('supplement')) {
    return `Hi ${customerName}! I'd be happy to help you with protein supplements. Based on your location in ${county}, you're in our ${territory} territory. 

We have excellent options like our Rangeland protein tubs - the 30-13 is very popular for range cattle, and the 24-12 High Fat is great for extra energy. 

What type of operation are you running - cow-calf, stockers, or finishing cattle? And about how many head are we talking about?`;
  }
  
  if (lowerMessage.includes('mineral') || lowerMessage.includes('wind') || lowerMessage.includes('rain')) {
    return `Great question about minerals! Our Wind & Rain Storm All Season 7.5 is our most popular mineral supplement. It's formulated specifically for year-round use and works excellent in ${territory} conditions.

We also have it available with AV4 organic trace minerals for enhanced absorption. What size herd are you supplementing?`;
  }
  
  if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('dollar')) {
    return `I understand you want to know about pricing. When you factor in our delivery service, proven results on 833,997 head of cattle, and ongoing LPS support, our total cost per pound of gain is very competitive.

Let me get some details about your operation so I can give you accurate numbers. What products are you interested in, and what quantities are we talking about?`;
  }
  
  if (lowerMessage.includes('delivery') || lowerMessage.includes('truck') || lowerMessage.includes('ship')) {
    return `We deliver right to your ranch by the ton with our trucks - including stinger trucks that can go directly into your bins. We cover all of Montana, Wyoming, and Idaho from our ${territory} warehouse.

For bagged products, we deliver by the pallet or ton. You can also pick up pallets at our warehouse with 48 hours advance notice. What type of products are you looking at?`;
  }
  
  // Default welcome response
  return `Hi ${customerName}! Thanks for contacting Montana Feed Company - we're here to help you with better feed for better beef.

I can help you find the right Purina products for your operation. We've got proven results on 833,997 head of cattle and specialists covering ${territory} who can visit your ranch.

What can I help you with today - protein supplements, minerals, or do you have questions about your current feeding program?`;
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 Montana Feed Company API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
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