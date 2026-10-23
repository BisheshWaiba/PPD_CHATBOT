"""
Simple test for the "new" command functionality.
"""
from chatbot import GeminiChatbot, ConversationState

def main():
    print("===== TESTING NEW COMMAND =====")
    
    # Create chatbot instance
    chatbot = GeminiChatbot()
    
    # Test user ID
    test_user = "test_new_simple"
    
    # Step 1: Initialize with greeting
    print("\nStep 1: Initialize with greeting")
    response = chatbot.get_response(test_user, "")
    print(f"Response: {response}")
    print(f"State: {chatbot.user_states[test_user]}")
    
    # Step 2: Manually set state to USER_LED
    print("\nStep 2: Set state to USER_LED")
    chatbot.user_states[test_user] = ConversationState.USER_LED
    chatbot.save_state(test_user)
    print(f"State: {chatbot.user_states[test_user]}")
    
    # Step 3: Send "new" command
    print("\nStep 3: Send 'new' command")
    response = chatbot.get_response(test_user, "new")
    print(f"Response: {response}")
    print(f"State: {chatbot.user_states[test_user]}")
    
    print("\n===== TEST COMPLETE =====")

if __name__ == "__main__":
    main() 