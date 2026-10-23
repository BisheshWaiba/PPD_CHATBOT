# Postpartum Support Chatbot with Gemini AI

This is a chatbot designed to provide support and information to women in the postpartum period. The chatbot can operate in two modes:
1. Rule-based mode (default): Uses predefined responses based on keywords
2. Gemini AI mode: Uses Google's Gemini AI to generate more natural and personalized responses

## Features

### Postpartum Support Conversations
The chatbot provides support and information to women in the postpartum period, helping them navigate common challenges and concerns.

### Symptoms Assessment Questionnaire
The chatbot includes a comprehensive symptoms assessment feature that allows users to check for:
- Emotional symptoms (mood, anxiety, etc.)
- Mental symptoms (concentration, memory, etc.)
- Sleep issues
- Physical recovery concerns
- Social or relationship changes

Users can access this feature by typing keywords like "symptoms", "check symptoms", or "assessment" during a conversation.

## Requirements

To use the Gemini AI integration, you'll need to install the following dependencies:

```bash
pip install google-generativeai requests
```

## Usage

The chatbot can be run from the command line with the following options:

```bash
python chatbot.py [options]
```

### Command Line Options

- `--input <file>`: Path to a file containing the user message (if not provided, "hello" is used)
- `--output <file>`: Path to write the chatbot's response (if not provided, response is printed to console)
- `--user <id>`: User ID for maintaining conversation state
- `--debug`: Enable debug output
- `--use-gemini`: Use Gemini AI for generating responses (if not specified, rule-based responses are used)

### Examples

Basic usage with rule-based responses:
```bash
python chatbot.py
```

Using Gemini AI:
```bash
python chatbot.py --use-gemini
```

Providing input from a file and saving output to another file:
```bash
python chatbot.py --input user_message.txt --output bot_response.txt --use-gemini
```

Maintaining conversation state with a specific user ID:
```bash
python chatbot.py --user test-user --use-gemini
```

## Conversation State

The chatbot maintains conversation state in the `temp` directory. This allows for continuous conversations where the AI remembers previous interactions. Each user has their own state file based on the provided user ID.

### Available States
- GREETING: Initial greeting state
- AWAITING_AGE: Waiting for user to provide their age
- AWAITING_BIRTH_TIMING: Asking about birth timing
- IN_PREGNANCY_INFO: Providing pregnancy-related information
- USER_LED: Open conversation state where user can ask questions
- SYMPTOMS_QUESTIONNAIRE: Interactive symptoms assessment questionnaire

## API Key Security

The Gemini API key is currently hardcoded in the script. In a production environment, you should:
1. Use environment variables to store the API key
2. Add appropriate error handling for API rate limits and authentication issues
3. Implement proper security measures to protect the API key

## Fallback Mechanism

If the Gemini API fails or is unavailable, the chatbot will automatically fall back to rule-based responses, ensuring it can always provide some level of support. 