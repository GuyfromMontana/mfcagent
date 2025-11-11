from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from datetime import datetime
import os
from zep_cloud.client import Zep
from zep_cloud import Message
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Get Zep API key from environment
ZEP_API_KEY = os.getenv("ZEP_API_KEY", "").strip()

if not ZEP_API_KEY:
    raise ValueError("ZEP_API_KEY environment variable is required")

print(f"🔑 Zep API Key loaded: {ZEP_API_KEY[:5]}...{ZEP_API_KEY[-5:]}")
print(f"🔑 Key length: {len(ZEP_API_KEY)}")
print(f"🔑 Key starts with 'z_': {ZEP_API_KEY.startswith('z_')}")

# Initialize Zep client
zep = Zep(api_key=ZEP_API_KEY)

@app.get("/")
async def root():
    return {
        "status": "MFC Agent Memory Service Running",
        "timestamp": datetime.now().isoformat(),
        "zep_configured": bool(ZEP_API_KEY)
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "mfc-agent-memory",
        "timestamp": datetime.now().isoformat()
    }

@app.post("/")
async def handle_vapi_webhook(request: Request):
    """Handle all incoming webhooks from Vapi"""
    try:
        payload = await request.json()
        
        # Get the message type
        message_type = payload.get("message", {}).get("type", "unknown")
        print(f"📨 Received webhook: {message_type}")
        
        # Handle assistant-request for context retrieval
        if message_type == "assistant-request":
            phone_number = payload.get("message", {}).get("call", {}).get("customer", {}).get("number")
            if phone_number:
                print(f"🔍 Context request for: {phone_number}")
                context = await get_caller_context(phone_number)
                return JSONResponse(content=context)
            return JSONResponse(content={})
        
        # Handle end-of-call-report for saving conversation
        elif message_type == "end-of-call-report":
            print("💾 End-of-call-report received")
            
            # Debug: Print top-level structure
            print(f"   Top-level payload keys: {list(payload.keys())}")
            
            # The actual data is in payload["message"]
            message_data = payload.get("message", {})
            print(f"   Message keys: {list(message_data.keys())}")
            
            # Extract phone number from call.customer.number
            call_data = message_data.get("call", {})
            customer_data = call_data.get("customer", {})
            phone_number = customer_data.get("number")
            
            # Extract call ID
            call_id = call_data.get("id")
            
            # Get transcript/messages - they're at the message level, not nested deeper
            transcript = message_data.get("transcript", "")
            messages = message_data.get("messages", [])
            
            print(f"   ✓ Messages found at message level!")
            print(f"   Transcript length: {len(transcript)}")
            
            if messages:
                print(f"   First message keys: {list(messages[0].keys())}")
            
            if phone_number and (transcript or messages):
                print(f"\n📞 Processing call:")
                print(f"   Phone: {phone_number}")
                print(f"   Call ID: {call_id}")
                print(f"   Transcript length: {len(transcript)}")
                print(f"   Messages: {len(messages)}")
                
                try:
                    await save_conversation(phone_number, call_id, transcript, messages)
                    return JSONResponse(content={"status": "success", "message": "Conversation saved"})
                except Exception as e:
                    print(f"❌ Error in save_conversation: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    raise HTTPException(status_code=500, detail=str(e))
            else:
                print("⚠️ Missing required data:")
                print(f"   Phone: {phone_number}")
                print(f"   Transcript: {len(transcript) if transcript else 0}")
                print(f"   Messages: {len(messages) if messages else 0}")
                return JSONResponse(content={"status": "ignored", "reason": "missing_data"})
        
        # Handle other webhook types
        else:
            print(f"⚠️ Unhandled webhook type: {message_type}")
            return JSONResponse(content={"status": "ignored", "type": message_type})
            
    except Exception as e:
        print(f"❌ Error processing webhook: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

async def get_caller_context(phone_number: str) -> dict:
    """
    Retrieve context for a returning caller from Zep memory
    This is called when Vapi makes an assistant-request
    """
    try:
        print(f"\n🔍 Looking up caller context for: {phone_number}")
        
        # Use phone number as user_id
        user_id = phone_number
        
        # Check if user exists
        try:
            user = zep.user.get(user_id=user_id)
            print(f"✓ Found returning caller: {user_id}")
        except Exception as e:
            print(f"ℹ️ New caller (user not found): {user_id}")
            return {
                "status": "new_caller",
                "message": "Welcome! This is your first call."
            }
        
        # Try to get recent conversations from threads
        try:
            # List all threads for this user
            # Note: We might need to adjust this based on Zep Cloud API capabilities
            # For now, return a basic context
            return {
                "status": "returning_caller",
                "message": f"Welcome back! We have your information on file.",
                "user_id": user_id
            }
        except Exception as e:
            print(f"⚠️ Error retrieving conversation history: {str(e)}")
            return {
                "status": "returning_caller",
                "message": "Welcome back!",
                "user_id": user_id
            }
            
    except Exception as e:
        print(f"❌ Error in get_caller_context: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "status": "error",
            "message": "Unable to retrieve caller context"
        }

async def save_conversation(phone_number: str, call_id: str, transcript: str, messages: list):
    """
    Save conversation to Zep memory
    """
    try:
        print(f"\n💾 Saving conversation for: {phone_number}")
        
        # Use phone number as user_id
        user_id = phone_number
        
        # Create thread_id combining phone and call_id for uniqueness
        thread_id = f"mfc_{phone_number}_{call_id}"
        print(f"   Thread: {thread_id}")
        
        # Ensure user exists in Zep
        try:
            user = zep.user.get(user_id=user_id)
            print(f"✓ User exists in Zep")
        except Exception as e:
            print(f"Creating new user in Zep: {user_id}")
            zep.user.add(
                user_id=user_id,
                first_name=phone_number,
                metadata={
                    "phone": phone_number,
                    "source": "mfc_voice_agent"
                }
            )
            print(f"✓ Created new user in Zep: {user_id}")
        
        # Format messages for Zep
        zep_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("message", "")
            
            # Map Vapi roles to Zep roles
            if role == "assistant":
                zep_role = "assistant"
            else:
                zep_role = "user"
            
            if content:
                zep_messages.append(
                    Message(
                        role_type=zep_role,
                        content=content
                    )
                )
        
        print(f"   Formatted messages: {len(zep_messages)}")
        
        if not zep_messages:
            print("⚠️ No messages to save")
            return
        
        print(f"   Thread: {thread_id}")
        print(f"   Messages: {len(zep_messages)}")
        
        # Create thread if it doesn't exist, then add messages
        try:
            # Try to get the thread first to see if it exists
            try:
                existing_thread = zep.thread.get(thread_id=thread_id)
                print(f"   ✓ Thread exists: {thread_id}")
            except Exception as e:
                # Thread doesn't exist, create it
                print(f"   Creating new thread: {thread_id}")
                zep.thread.add(
                    thread_id=thread_id,
                    user_id=user_id
                )
                print(f"   ✓ Thread created successfully")
            
            # Now add messages to the thread
            zep.thread.add_messages(
                thread_id=thread_id,
                messages=zep_messages
            )
            
            print(f"✓ Conversation saved successfully to thread: {thread_id}")
            print(f"   Messages saved: {len(zep_messages)}")
            
        except Exception as e:
            print(f"❌ Error saving conversation: {str(e)}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to save conversation: {str(e)}")
        
    except Exception as e:
        print(f"❌ Error in save_conversation: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

async def add_ranch_data(phone_number: str, ranch_data: dict):
    """
    Optional: Add structured ranch data to user metadata
    This can be called separately if you want to store ranch-specific info
    """
    try:
        user_id = phone_number
        
        # Update user metadata with ranch information
        zep.user.update(
            user_id=user_id,
            metadata={
                **ranch_data,
                "last_updated": datetime.now().isoformat()
            }
        )
        
        print(f"✓ Ranch data added for user: {user_id}")
        
    except Exception as e:
        print(f"❌ Error adding ranch data: {str(e)}")
        raise

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3001))
    uvicorn.run(app, host="0.0.0.0", port=port)
