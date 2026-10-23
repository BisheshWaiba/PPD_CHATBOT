"""
Test script for the symptom report functionality.
"""
from chatbot import GeminiChatbot

def main():
    print("===== TESTING SYMPTOM REPORT =====")
    
    # Create chatbot instance
    chatbot = GeminiChatbot()
    
    # Test message with symptoms
    test_message = "I've been feeling very sad and tearful, and I'm not sleeping well. I also have some pain in my incision area."
    
    # Generate report
    report = chatbot.generate_symptom_report(test_message)
    
    # Print the report
    print(report)
    
    print("===== TEST COMPLETE =====")

if __name__ == "__main__":
    main() 