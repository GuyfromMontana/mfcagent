# Montana Feed Company - Voice Agent API

Complete API functions to connect your Vapi voice agent to your Supabase database with Montana Feed Company data.

## 📁 What's Included

### API Endpoints (`/api` folder)
6 serverless functions that your voice agent calls:

1. **search-products.js** - Search the product catalog
2. **query-knowledge.js** - Answer ranching questions from knowledge base
3. **find-specialist.js** - Find specialists by location
4. **get-warehouse.js** - Get warehouse information
5. **create-lead.js** - Capture leads from calls
6. **get-recommendations.js** - Recommend products based on needs

### Configuration Files
- **package.json** - Dependencies (Supabase client)
- **vercel.json** - Vercel deployment configuration
- **.env.example** - Environment variables template

### Documentation
- **DEPLOYMENT_GUIDE.md** - Step-by-step deployment instructions
- **vapi-function-definitions.json** - Function definitions to copy into Vapi

## 🚀 Quick Start

**Read the DEPLOYMENT_GUIDE.md file first!** It has complete step-by-step instructions.

Quick overview:
1. Push this code to GitHub
2. Deploy to Vercel (free tier works)
3. Add Supabase credentials as environment variables
4. Copy function definitions into Vapi
5. Test your voice agent!

## 🔧 Requirements

- Supabase database with MFC data loaded
- Vercel account (free)
- GitHub account
- Vapi voice agent

## 📞 How It Works

```
Caller
  ↓
Vapi Voice Agent
  ↓
API Functions (Vercel)
  ↓
Supabase Database (Your MFC Data)
  ↓
Response back to caller
```

## 🎯 What Your Agent Can Do

Once deployed, your voice agent can:
- ✅ Answer questions about products (AV4, XPC, Top Gun, etc.)
- ✅ Provide ranch consultation advice from knowledge base
- ✅ Route callers to the right specialist based on location
- ✅ Give warehouse locations and hours
- ✅ Capture lead information for follow-up
- ✅ Recommend products based on cattle type and needs

## 📊 Example Interactions

**Caller:** "Tell me about AV4"
**Agent:** Uses `search_products` function → Returns AV4 details from database

**Caller:** "What should I feed my cows in winter?"
**Agent:** Uses `query_knowledge` function → Returns winter feeding advice

**Caller:** "I'm in Beaverhead County, who should I talk to?"
**Agent:** Uses `find_specialist` function → Finds Danielle Peterson (Dillon LPS)

## 🛠️ Local Development

If you want to test locally before deploying:

```bash
# Install dependencies
npm install

# Create .env file (copy from .env.example and add your keys)
cp .env.example .env

# Run locally with Vercel CLI
npm run dev
```

## 📝 Environment Variables

You need these in Vercel:

```
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_KEY=your-service-role-key
```

**IMPORTANT:** Use the `service_role` key, NOT the `anon public` key!

## 🔐 Security

- All endpoints require POST requests only
- CORS enabled for Vapi
- Service role key needed for database access
- Never commit your .env file!

## 📚 Next Steps After Deployment

1. **Test each endpoint** - Make sure they return data
2. **Add to Vapi** - Configure all 6 functions in your voice agent
3. **Write system prompt** - Tell your agent how to use the functions
4. **Test calls** - Make test calls to refine the experience
5. **Monitor** - Check Vercel and Supabase logs

## 💡 Tips

- Start with testing one function at a time
- Check Vercel function logs if something isn't working
- Test with real ranch scenarios
- Update the knowledge base as you learn what questions callers ask

## 🆘 Need Help?

Check the DEPLOYMENT_GUIDE.md for detailed troubleshooting steps!
aa
---

**Ready to deploy? Start with DEPLOYMENT_GUIDE.md!** 🚀
