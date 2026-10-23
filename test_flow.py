from chatbot import GeminiChatbot, ConversationState

def run_test():
    print("\n===== STARTING CONVERSATION FLOW TEST =====\n")
    
    # Create a test chatbot instance
    test_user = "flow_test_user"
    chatbot = GeminiChatbot()
    
    # Define test messages
    test_inputs = [
        "hello",
        "30",
        "2 weeks ago",
        "3",  # Emotional: Clear and okay
        "2",  # Mental: Foggy or distracted
        "1",  # Sleep: Very poorly
        "3",  # Physical: Recovering well
        "Headaches and fatigue"  # Symptoms
    ]
    
    # Run through the conversation flow
    for idx, message in enumerate(test_inputs):
        print(f"\nTEST STEP {idx+1}: '{message}'")
        
        if idx == 0:
            # First message needs initialization
            chatbot.user_states[test_user] = ConversationState.GREETING
            chatbot.save_state(test_user)
        
        response = chatbot.get_response(test_user, message)
        print(f"Response: {response}")
        print(f"New state: {chatbot.user_states.get(test_user)}")
    
    print("\n===== CONVERSATION FLOW TEST COMPLETE =====")

if __name__ == "__main__":
    run_test() 