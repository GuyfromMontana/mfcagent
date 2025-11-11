"""
Montana Feed Company Voice Agent with Zep Memory Integration
This API runs on Railway and connects Vapi with Zep for caller memory
"""

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime
from zep_cloud.client import Zep
from zep_cloud.types import Message
import os
import json

# Initialize FastAPI
app = FastAPI(title="MFC Voice Agent with Memory")

# Initialize Zep (API key from environment variable)
zep = Zep(api_key=os.getenv("ZEP_API_KEY"))

# ============================================================================
# DATA MODELS
# ============================================================================

class CallerContextRequest(BaseModel):
    phone_number: str
    caller_name: str = None  # Optional: if Vapi can capture name

class SaveConversationRequest(BaseModel):
    phone_number: str
    session_id: str
    transcript: list  # List of {role: "user"/"assistant", content: "text"}
    call_duration: int = None
    call_outcome: str = None  # "completed", "transferred", etc.

class AddRanchDataRequest(BaseModel):
    phone_number: str
    ranch_name: str = None
    location: str = None
    herd_size: int = None
    operation_type: str = None
    specialist_name: str = None

# ============================================================================
# VAPI WEBHOOK HANDLER (Main entry point for webhooks)
# ============================================================================

@app.post("/")
async def handle_vapi_webhook(request: Request):
    """
    Main webhook handler for all Vapi events.
    Processes different webhook types and triggers appropriate actions.
    """
    try:
        # Get the webhook payload
        payload = await request.json()
        message_type = payload.get("message", {}).get("type")
        
        print(f"📨 Received webhook: {message_type}")
        
        # ASSISTANT REQUEST - Call starting, get caller context
        if message_type == "assistant-request":
            phone_number = payload.get("message", {}).get("call", {}).get("customer", {}).get("number")
            print(f"📞 Incoming call from: {phone_number}")
            
            # Get context from Zep
            try:
                context_response = await get_caller_context(
                    CallerContextRequest(phone_number=phone_number)
                )
                
                print(f"📝 Retrieved context from Zep: {context_response.get('is_new_caller')}")
                
                # Return context to Vapi to inject into conversation
                return {
                    "assistant": {
                        "firstMessage": context_response.get("context", "")
                    }
                }
            except Exception as e:
                print(f"❌ Error getting context: {str(e)}")
                return {"assistant": {}}
        
        # END OF CALL REPORT - Call ended, save conversation
        elif message_type == "end-of-call-report":
            call_data = payload.get("message", {}).get("call", {})
            phone_number = call_data.get("customer", {}).get("number")
            transcript = call_data.get("transcript", [])
            call_id = call_data.get("id")
            
            print(f"💾 Saving conversation to Zep")
            print(f"   Phone: {phone_number}")
            print(f"   Call ID: {call_id}")
            print(f"   Messages: {len(transcript)}")
            
            if phone_number and transcript:
                try:
                    # Convert Vapi transcript format to our format
                    formatted_transcript = []
                    for msg in transcript:
                        role = msg.get("role", "assistant")
                        content = msg.get("content", "") or msg.get("text", "")
                        if content:
                            formatted_transcript.append({
                                "role": role,
                                "content": content
                            })
                    
                    # Save to Zep
                    session_id = f"mfc_{phone_number}_{call_id}"
                    await save_conversation(
                        SaveConversationRequest(
                            phone_number=phone_number,
                            session_id=session_id,
                            transcript=formatted_transcript
                        )
                    )
                    
                    print(f"✓ Conversation saved successfully to session: {session_id}")
                    
                except Exception as e:
                    print(f"❌ Error saving conversation: {str(e)}")
                    import traceback
                    traceback.print_exc()
            else:
                print(f"⚠️ Missing phone number or transcript")
            
            return {"status": "success"}
        
        # OTHER WEBHOOK TYPES - Just acknowledge
        else:
            print(f"⚠️ Unhandled webhook type: {message_type}")
            return {"status": "acknowledged"}
            
    except Exception as e:
        print(f"❌ Webhook handler error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

# ============================================================================
# ENDPOINT 1: GET CALLER CONTEXT (Called when call starts)
# ============================================================================

@app.post("/get-caller-context")
async def get_caller_context(request: CallerContextRequest):
    """
    Called by Vapi when a call starts.
    Returns context about the caller from previous conversations.
    """
    user_id = request.phone_number
    session_id = f"call-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    
    print(f"📞 Incoming call from: {user_id}")
    
    try:
        # Try to get existing user from Zep
        user = await zep.user.get(user_id=user_id)
        print(f"✓ Found existing caller: {user_id}")
        
        # Get memory context for this user
        try:
            memory = await zep.memory.get(
                session_id=session_id,
                user_id=user_id
            )
            
            # Zep automatically generates a context string
            context = memory.context if memory.context else "Returning caller, but no previous conversation details available."
            
            # Also get recent facts
            facts = memory.facts if hasattr(memory, 'facts') else []
            
            print(f"✓ Retrieved memory context ({len(facts)} facts)")
            
            return {
                "success": True,
                "is_new_caller": False,
                "session_id": session_id,
                "context": context,
                "facts": facts[:5],  # Send top 5 most relevant facts
                "message": "Returning caller - memory loaded"
            }
            
        except Exception as e:
            print(f"⚠ Memory retrieval error: {str(e)}")
            return {
                "success": True,
                "is_new_caller": False,
                "session_id": session_id,
                "context": "Returning caller - welcome them back but no previous conversation details available.",
                "message": "User exists but memory unavailable"
            }
        
    except Exception as e:
        # First-time caller - create new user in Zep
        print(f"✓ New caller detected: {user_id}")
        
        try:
            await zep.user.add(user_id=user_id)
            print(f"✓ Created new user in Zep: {user_id}")
        except Exception as create_error:
            print(f"⚠ Error creating user: {str(create_error)}")
        
        return {
            "success": True,
            "is_new_caller": True,
            "session_id": session_id,
            "context": "This is a new caller. Be welcoming and friendly. Ask about their operation - herd size, location, and what they need help with today.",
            "message": "New caller - no previous history"
        }

# ============================================================================
# ENDPOINT 2: SAVE CONVERSATION (Called after call ends)
# ============================================================================

@app.post("/save-conversation")
async def save_conversation(request: SaveConversationRequest):
    """
    Called by Vapi after a call ends.
    Saves the conversation transcript to Zep memory.
    """
    user_id = request.phone_number
    
    print(f"💾 Saving conversation for: {user_id}")
    print(f"   Session: {request.session_id}")
    print(f"   Messages: {len(request.transcript)}")
    
    try:
        # Convert transcript to Zep messages
        messages = []
        for msg in request.transcript:
            messages.append(
                Message(
                    role_type=msg.get("role", "user"),  # "user" or "assistant"
                    role=msg.get("name", "caller" if msg.get("role") == "user" else "agent"),
                    content=msg["content"]
                )
            )
        
        # Add messages to Zep
        result = await zep.memory.add(
            session_id=request.session_id,
            user_id=user_id,
            messages=messages
        )
        
        print(f"✓ Conversation saved successfully")
        
        return {
            "success": True,
            "user_id": user_id,
            "session_id": request.session_id,
            "messages_saved": len(messages),
            "message": "Conversation saved to memory"
        }
        
    except Exception as e:
        print(f"❌ Error saving conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save conversation: {str(e)}")

# ============================================================================
# ENDPOINT 3: ADD RANCH DATA (Optional - for structured data)
# ============================================================================

@app.post("/add-ranch-data")
async def add_ranch_data(request: AddRanchDataRequest):
    """
    Optional endpoint to add structured ranch data to Zep graph.
    Can be called manually or automatically after qualifying calls.
    """
    user_id = request.phone_number
    
    print(f"📝 Adding ranch data for: {user_id}")
    
    try:
        # Build data object
        ranch_data = {}
        if request.ranch_name:
            ranch_data["ranch_name"] = request.ranch_name
        if request.location:
            ranch_data["location"] = request.location
        if request.herd_size:
            ranch_data["herd_size"] = request.herd_size
        if request.operation_type:
            ranch_data["operation_type"] = request.operation_type
        if request.specialist_name:
            ranch_data["specialist_name"] = request.specialist_name
        
        # Add to Zep graph
        await zep.graph.add(
            user_id=user_id,
            type="json",
            data=ranch_data
        )
        
        print(f"✓ Ranch data saved: {ranch_data}")
        
        return {
            "success": True,
            "user_id": user_id,
            "data_added": ranch_data,
            "message": "Ranch data saved"
        }
        
    except Exception as e:
        print(f"❌ Error saving ranch data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save ranch data: {str(e)}")

# ============================================================================
# ENDPOINT 4: GET USER FACTS (For testing/debugging)
# ============================================================================

@app.get("/get-user-facts/{phone_number}")
async def get_user_facts(phone_number: str):
    """
    Testing endpoint to see what Zep knows about a user.
    """
    try:
        # Search for facts about this user
        results = await zep.memory.search_sessions(
            text="",  # Empty query returns all facts
            user_id=phone_number,
            search_scope="facts"
        )
        
        facts = []
        for result in results.results:
            if hasattr(result, 'fact'):
                facts.append({
                    "fact": result.fact,
                    "created_at": str(result.created_at) if hasattr(result, 'created_at') else None
                })
        
        return {
            "success": True,
            "user_id": phone_number,
            "facts": facts,
            "total_facts": len(facts)
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": "Could not retrieve facts"
        }

# ============================================================================
# HEALTH CHECK & INFO
# ============================================================================

@app.get("/info")
async def root():
    """Service information"""
    return {
        "service": "MFC Voice Agent Memory API",
        "status": "running",
        "zep_configured": bool(os.getenv("ZEP_API_KEY")),
        "endpoints": {
            "webhook": "POST /",
            "get_context": "/get-caller-context",
            "save_conversation": "/save-conversation",
            "add_ranch_data": "/add-ranch-data",
            "get_facts": "/get-user-facts/{phone_number}",
            "health": "/health",
            "info": "/info"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint for Railway"""
    try:
        # Test Zep connection
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "zep_api_key_set": bool(os.getenv("ZEP_API_KEY"))
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")

# ============================================================================
# RUN SERVER (for local testing)
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=port)
