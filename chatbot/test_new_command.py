"""
Test script for the "new" command functionality.
"""
import os
import sys
import time
from chatbot import GeminiChatbot, ConversationState

def main():
    # Initialize chatbot
    print("Initializing chatbot...")
    chatbot = GeminiChatbot()
    
    # Test user
    test_user = "test_new_command"
    print(f"Using test user: {test_user}")
    
    # Step 1: Reset state
    print("\nStep 1: Reset state")
    chatbot.reset_state(test_user)
    print(f"Current state: {chatbot.user_states.get(test_user)}")
    
    # Step 2: Set state directly to USER_LED
    print("\nStep 2: Set state to USER_LED")
    chatbot.user_states[test_user] = ConversationState.USER_LED
    chatbot.save_state(test_user)
    print(f"Set state to: {chatbot.user_states.get(test_user)}")
    
    # Step 3: Get response for testing
    print("\nStep 3: Get response for USER_LED state")
    response = chatbot.get_response_for_state(ConversationState.USER_LED)
    print(f"Response: {response}")

if __name__ == "__main__":
    main() 