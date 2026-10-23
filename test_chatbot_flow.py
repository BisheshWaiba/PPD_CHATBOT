import os
import json
import subprocess
import time

# Define the test user ID
TEST_USER = "flow_test_user"
STATE_FILE = os.path.join("..", "temp", f"state_{TEST_USER}.json")

# Remove old state file if it exists
if os.path.exists(STATE_FILE):
    os.remove(STATE_FILE)
    print(f"Removed old state file: {STATE_FILE}")

def run_chatbot(message):
    """Run the chatbot with a message and return the response"""
    cmd = ["python", "chatbot.py", "--user", TEST_USER, "--message", message]
    result = subprocess.run(cmd, capture_output=True, text=True)
    print(f"DEBUG OUTPUT: {result.stderr}")
    return result.stdout.strip()

def get_current_state():
    """Get the current state from the state file"""
    if not os.path.exists(STATE_FILE):
        return "No state file found"
        
    with open(STATE_FILE, 'r') as f:
        state_data = json.load(f)
        return state_data.get('state', 'UNKNOWN')

# Run the conversation flow
print("===== STARTING CONVERSATION FLOW TEST =====")

# Initial greeting
response = run_chatbot("hello")
print(f"BOT: {response}")
print(f"Current state: {get_current_state()}")

# Age response
response = run_chatbot("30")
print(f"BOT: {response}")
print(f"Current state: {get_current_state()}")

# Birth timing response
response = run_chatbot("2 weeks ago")
print(f"BOT: {response}")
print(f"Current state: {get_current_state()}")

# Emotional state response
response = run_chatbot("3")
print(f"BOT: {response}")
print(f"Current state: {get_current_state()}")

# Mental state response
response = run_chatbot("2")
print(f"BOT: {response}")
print(f"Current state: {get_current_state()}")

# Sleep response
response = run_chatbot("1")
print(f"BOT: {response}")
print(f"Current state: {get_current_state()}")

# Physical response
response = run_chatbot("3")
print(f"BOT: {response}")
print(f"Current state: {get_current_state()}")

# Symptoms response
response = run_chatbot("I'm having headaches and feeling very tired")
print(f"BOT: {response}")
print(f"Current state: {get_current_state()}")

print("===== CONVERSATION FLOW TEST COMPLETE =====") 