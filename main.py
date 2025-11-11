"""
Montana Feed Company Voice Agent with Zep Memory Integration
This API runs on Railway and connects Vapi with Zep Cloud v3 for caller memory
"""

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime
from zep_cloud.client import Zep
import os
import json

# Initialize FastAPI
app = FastAPI(title="MFC Voice Agent with Memory")

# Initialize Zep Cloud client (API key from environment variable)
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
            # Debug: Show top-level message structure
            message_data = payload.get("message", {})
            print(f"💾 End-of-call-report received")
            print(f"   Top-level payload keys: {list(payload.keys())}")
            print(f"   Message keys: {list(message_data.keys())}")
            
            # Check if messages array exists at message level
            transcript = None
            if "messages" in message_data:
                print(f"   ✓ Messages found at message level!")
                transcript = message_data.get("messages")
                print(f"   Transcript length: {len(transcript) if transcript else 0}")
                if transcript and len(transcript) > 0:
                    print(f"   First message keys: {list(transcript[0].keys())}")
                    print(f"   First message sample: {transcript[0]}")
            
            # Get call data
            call_data = message_data.get("call", {})
            phone_number = call_data.get("customer", {}).get("number")
            call_id = call_data.get("id")
            
            print(f"   Phone: {phone_number}")
            print(f"   Call ID: {call_id}")
            
            # If no messages at message level, check call level
            if not transcript:
                print(f"   Checking call level for messages...")
                print(f"   Call data keys: {list(call_data.keys())}")
                transcript = call_data.get("messages")
                if transcript:
                    print(f"   ✓ Messages found at call level!")
                    print(f"   Transcript length: {len(transcript)}")
            
            if phone_number and transcript:
                try:
                    # Convert Vapi transcript format to our format
                    formatted_transcript = []
                    for msg in transcript:
                        role = msg.get("role", "assistant")
                        content = msg.get("content", "") or msg.get("text", "") or msg.get("message", "")
                        if content:
                            formatted_transcript.append({
                                "role": role,
                                "content": content
                            })
                    
                    print(f"   Formatted messages: {len(formatted_transcript)}")
                    
                    if formatted_transcript:
                        # Save to Zep using thread_id as session_id
                        thread_id = f"mfc_{phone_number}_{call_id}"
                        await save_conversation(
                            SaveConversationRequest(
                                phone_number=phone_number,
                                session_id=thread_id,
                                transcript=formatted_transcript
                            )
                        )
                        
                        print(f"✓ Conversation saved successfully to thread: {thread_id}")
                    else:
                        print(f"⚠️ No messages with content to save")
                    
                except Exception as e:
                    print(f"❌ Error saving conversation: {str(e)}")
                    import traceback
                    traceback.print_exc()
            else:
                print(f"⚠️ Missing phone number or transcript")
                print(f"   Phone exists: {phone_number is not None}")
                print(f"   Transcript exists: {transcript is not None}")
            
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
    # Use a consistent thread ID pattern for this user's calls
    thread_id = f"mfc_{user_id}_current"
    
    print(f"📞 Incoming call from: {user_id}")
    
    try:
        # Try to get existing user from Zep
        user = zep.user.get(user_id=user_id)
        print(f"✓ Found existing caller: {user_id}")
        
        # Get memory context for this user
        try:
            # Get user context from their thread
            context_result = zep.thread.get_user_context(
                thread_id=thread_id,
                user_id=user_id
            )
            
            # Extract context string and facts
            context = context_result.context if hasattr(context_result, 'context') else "Returning caller, but no previous conversation details available."
            facts = context_result.facts if hasattr(context_result, 'facts') else []
            
            print(f"✓ Retrieved memory context ({len(facts)} facts)")
            
            return {
                "success": True,
                "is_new_caller": False,
                "session_id": thread_id,
                "context": context,
                "facts": facts[:5] if facts else [],  # Send top 5 most relevant facts
                "message": "Returning caller - memory loaded"
            }
            
        except Exception as e:
            print(f"⚠ Memory retrieval error: {str(e)}")
            return {
                "success": True,
                "is_new_caller": False,
                "session_id": thread_id,
                "context": "Returning caller - welcome them back but no previous conversation details available.",
                "message": "User exists but memory unavailable"
            }
        
    except Exception as e:
        # First-time caller - create new user in Zep
        print(f"✓ New caller detected: {user_id}")
        
        try:
            zep.user.add(
                user_id=user_id,
                first_name="Montana",  # Placeholder - update with actual name if captured
                last_name="Rancher"
            )
            print(f"✓ Created new user in Zep: {user_id}")
            
            # Create initial thread for this user
            zep.thread.add(
                thread_id=thread_id,
                user_id=user_id
            )
            print(f"✓ Created new thread in Zep: {thread_id}")
            
        except Exception as create_error:
            print(f"⚠ Error creating user/thread: {str(create_error)}")
        
        return {
            "success": True,
            "is_new_caller": True,
            "session_id": thread_id,
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
    Saves the conversation transcript to Zep memory using the thread API.
    """
    user_id = request.phone_number
    thread_id = request.session_id
    
    print(f"💾 Saving conversation for: {user_id}")
    print(f"   Thread: {thread_id}")
    print(f"   Messages: {len(request.transcript)}")
    
    try:
        # Ensure user exists in Zep
        try:
            zep.user.get(user_id=user_id)
            print(f"✓ User exists in Zep")
        except:
            # Create user if they don't exist
            zep.user.add(
                user_id=user_id,
                first_name="Montana",
                last_name="Rancher"
            )
            print(f"✓ Created new user in Zep: {user_id}")
        
        # Ensure thread exists
        try:
            zep.thread.get(thread_id=thread_id)
            print(f"✓ Thread exists in Zep")
        except:
            # Create thread if it doesn't exist
            zep.thread.add(
                thread_id=thread_id,
                user_id=user_id
            )
            print(f"✓ Created new thread in Zep: {thread_id}")
        
        # Convert transcript to Zep Cloud message format
        messages = []
        for msg in request.transcript:
            role = msg.get("role", "user")
            content = msg["content"]
            
            # Zep Cloud expects specific message format
            messages.append({
                "role": "user" if role == "user" else "assistant",
                "content": content,
                "name": "Caller" if role == "user" else "Montana Feed Agent"
            })
        
        # Add messages to the thread
        zep.thread.add_messages(
            thread_id=thread_id,
            messages=messages
        )
        
        print(f"✓ Conversation saved successfully")
        
        return {
            "success": True,
            "user_id": user_id,
            "thread_id": thread_id,
            "messages_saved": len(messages),
            "message": "Conversation saved to memory"
        }
        
    except Exception as e:
        print(f"❌ Error saving conversation: {str(e)}")
        import traceback
        traceback.print_exc()
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
        
        # Add to Zep graph using the new API
        zep.graph.add(
            user_id=user_id,
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
    Uses the graph search API to find facts.
    """
    try:
        # Search the user's graph for facts
        search_results = zep.graph.search(
            user_id=phone_number,
            query="",  # Empty query to get all facts
            scope="edges"  # Search for facts (edges in the graph)
        )
        
        facts = []
        if hasattr(search_results, 'edges'):
            for edge in search_results.edges[:10]:  # Limit to top 10
                facts.append({
                    "fact": edge.fact if hasattr(edge, 'fact') else str(edge),
                    "created_at": str(edge.created_at) if hasattr(edge, 'created_at') else None
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
        "zep_version": "Cloud v3",
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
    port = int(os.getenv("PORT", 8000))  
    uvicorn.run(app, host="0.0.0.0", port=port)
