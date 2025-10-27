// API Endpoint: /api/query-knowledge
// Queries the ranch consultation knowledge base

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

    const { question, category, keywords } = req.body;

    let dbQuery = supabase
      .from('knowledge_base')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (question) {
      const questionWords = question.toLowerCase().split(' ')
        .filter(word => word.length > 3);
      
      if (questionWords.length > 0) {
        dbQuery = dbQuery.or(
          questionWords.map(word => `keywords.cs.{${word}}`).join(',')
        );
      }
    }

    if (category) {
      dbQuery = dbQuery.eq('category', category);
    }

    if (keywords && Array.isArray(keywords)) {
      dbQuery = dbQuery.contains('keywords', keywords);
    }

    const { data, error } = await dbQuery.limit(3);

    if (error) throw error;

    const answers = data.map(kb => ({
      question: kb.question,
      answer: kb.answer,
      category: kb.category,
      subcategory: kb.subcategory,
      related_products: kb.related_products
    }));

    return res.status(200).json({
      success: true,
      answers: answers,
      count: answers.length
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
