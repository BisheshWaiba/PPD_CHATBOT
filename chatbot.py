def self_test():
    """Run a self-test of the conversation flow"""
    print("\n===== STARTING SELF-TEST =====")
    
    # Create a test chatbot instance
    test_user = "self_test_user"
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
    
    print("\n===== SELF-TEST COMPLETE =====")

def main():
    print("===== CHATBOT STARTED =====", file=sys.stderr)
    try:
        parser = argparse.ArgumentParser(description="Chatbot command-line tool")
        parser.add_argument('--user', required=True, help="User ID for the session")
        parser.add_argument('--message', default="", help="Direct message from the user")
        parser.add_argument('--message-file', help="File containing the message from the user")
        parser.add_argument('--first-run', action='store_true', help="Flag for initial greeting")
        parser.add_argument('--test', action='store_true', help="Run self-test")
        args = parser.parse_args()
        
        # Run self-test if requested
        if args.test:
            self_test()
            return
        
        log_debug(f"Command-line args: {args}")
        
        # Initialize chatbot
        log_debug("Initializing chatbot")
        chatbot = GeminiChatbot()
        if not chatbot.initialized:
            log_debug("Chatbot failed to initialize")
            print("Failed to initialize chatbot. Exiting.", file=sys.stderr)
            print("I'm sorry, I'm having trouble connecting. Please try again.")
            return
            
        log_debug("Chatbot initialized successfully")
        
        try:
            # Load state for the user
            chatbot.load_state(args.user)
            
            # Get message either from args or file
            message = args.message
            if args.message_file and os.path.exists(args.message_file):
                try:
                    with open(args.message_file, 'r', encoding='utf-8') as f:
                        message = f.read().strip()
                    log_debug(f"Read message from file: '{message}'")
                except Exception as e:
                    log_debug(f"Error reading message file: {e}")
                    log_debug(traceback.format_exc())
                    # Continue with empty message
            
            # Generate response
            log_debug(f"Generating response for user {args.user} with message: '{message}'")
            response = chatbot.get_response(args.user, message)
            
            # Output response
            print(response)
            
            log_debug("===== CHATBOT FINISHED =====")
            
        except Exception as e:
            log_debug(f"Error in main execution: {e}")
            log_debug(traceback.format_exc())
            print("I'm sorry, I encountered an error. Please try again.")
    except Exception as e:
        print(f"Error initializing chatbot: {e}", file=sys.stderr)
        print("I'm sorry, I'm having trouble starting. Please try again.")

if __name__ == "__main__":
    main() 