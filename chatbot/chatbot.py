# AI-powered chatbot with Gemini AI integration
import argparse
import json
import os
import sys
import random
import uuid
import requests
import time
import traceback
from enum import Enum
import re

# Add the directory containing this file to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def log_debug(message):
    """Log debug messages to stderr"""
    print(f"DEBUG: {message}", file=sys.stderr)

# Directory to store state files
STATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'temp')
if not os.path.exists(STATE_DIR):
    os.makedirs(STATE_DIR)

class ConversationState(Enum):
    GREETING = "GREETING"
    PERMISSION_ASK = "PERMISSION_ASK"
    AWAITING_AGE = "AWAITING_AGE"
    AGE_VERIFICATION_FAILED = "AGE_VERIFICATION_FAILED"
    IN_PREGNANCY_INFO = "IN_PREGNANCY_INFO"
    SYMPTOMS_QUESTION = "SYMPTOMS_QUESTION"
    USER_LED = "USER_LED"
    SYMPTOMS_QUESTIONNAIRE = "SYMPTOMS_QUESTIONNAIRE"

class GeminiChatbot:
    """Class to handle interactions with Gemini API"""
    
    def __init__(self):
        # We'll keep the API integration but make it more robust
        self.initialized = True
        self.user_states = {}
        self.last_responses = {}
            
    def reset_state(self, user_id=None):
        """Reset the conversation state to GREETING"""
        if user_id:
            self.user_states[user_id] = ConversationState.GREETING
            log_debug(f"Reset state for user {user_id} to GREETING")
        else:
            # Reset state for all users (generally not used)
            for uid in self.user_states:
                self.user_states[uid] = ConversationState.GREETING
                log_debug(f"Reset state for user {uid} to GREETING")
        
        # Save the updated state
        if user_id:
            self.save_state(user_id)
            
    def load_state(self, user_id):
        """Load state from file"""
        log_debug(f"Loading state for user {user_id}")
        state_file = os.path.join(STATE_DIR, f'state_{user_id}.json')
        if os.path.exists(state_file):
            try:
                with open(state_file, 'r') as f:
                    state_data = json.load(f)
                    self.user_states[user_id] = ConversationState(state_data.get('state', 'GREETING'))
                    log_debug(f"Loaded state: {self.user_states[user_id]}")
                    return True
            except Exception as e:
                log_debug(f"Error loading state: {e}")
                log_debug(traceback.format_exc())
        log_debug(f"No existing state found, initializing new state for {user_id}")
        return False

    def save_state(self, user_id):
        """Save state to file"""
        log_debug(f"Saving state for user {user_id}: {self.user_states.get(user_id)}")
        state_file = os.path.join(STATE_DIR, f'state_{user_id}.json')
        try:
            state_to_save = {
                'state': self.user_states.get(user_id, ConversationState.GREETING).value
            }
            with open(state_file, 'w') as f:
                json.dump(state_to_save, f)
            log_debug(f"State saved successfully")
        except Exception as e:
            log_debug(f"Error saving state: {e}")
            log_debug(traceback.format_exc())
    
    def _update_state(self, user_id, message):
        """Update the conversation state based on user input."""
        log_debug(f"Updating state for user {user_id}")
        log_debug(f"Current state: {self.user_states.get(user_id)}")
        log_debug(f"Message: '{message}'")
        
        current_state = self.user_states.get(user_id)
        
        if current_state == ConversationState.GREETING:
            log_debug("State transition: GREETING -> PERMISSION_ASK")
            self.user_states[user_id] = ConversationState.PERMISSION_ASK

        elif current_state == ConversationState.PERMISSION_ASK:
            # User is responding to permission request to ask questions
            if message.lower() in ['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay', '1', '👍']:
                log_debug("User consented to questions, transitioning to AWAITING_AGE")
            else:
                log_debug("User declined questions, but still going to AWAITING_AGE")
                
            # Regardless of yes/no answer, we proceed to AWAITING_AGE
            self.user_states[user_id] = ConversationState.AWAITING_AGE

        elif current_state == ConversationState.AWAITING_AGE or current_state == ConversationState.AGE_VERIFICATION_FAILED:
            try:
                age = None
                if message.isdigit():
                    age = int(message)
                    log_debug(f"Parsed age: {age}")
                elif 'year' in message:
                    numbers = [int(s) for s in message.split() if s.isdigit()]
                    if numbers:
                        age = numbers[0]
                        log_debug(f"Parsed age from text: {age}")
                
                if age is not None:
                    if age < 18:
                        log_debug("Age under 18, transitioning to AGE_VERIFICATION_FAILED")
                        self.user_states[user_id] = ConversationState.AGE_VERIFICATION_FAILED
                    else:
                        # Skip directly to USER_LED state
                        log_debug("Adult age, transitioning directly to USER_LED")
                        self.user_states[user_id] = ConversationState.USER_LED
                else:
                    log_debug("Could not parse age from message")
            except Exception as e:
                log_debug(f"Error processing age: {e}")
                log_debug(traceback.format_exc())
        
        elif current_state == ConversationState.IN_PREGNANCY_INFO:
            log_debug("Staying in IN_PREGNANCY_INFO state")
            # The state doesn't change here unless the user wants to exit
            pass

        elif current_state == ConversationState.SYMPTOMS_QUESTIONNAIRE:
            if 'exit' in message.lower() or 'back' in message.lower():
                log_debug("Exiting symptoms questionnaire, transitioning to USER_LED")
                self.user_states[user_id] = ConversationState.USER_LED
            else:
                log_debug("Staying in SYMPTOMS_QUESTIONNAIRE state")
                # Stay in symptoms questionnaire state to continue the assessment
                pass
        
        # Check for keywords in any state to transition to appropriate state
        if current_state == ConversationState.USER_LED:
            # Check for EPDS keywords
            epds_keywords = ['epds', 'edinburgh', 'depression scale', 'screening', 'assessment', 'questionnaire', 'test']
            symptoms_keywords = ['symptoms', 'symptom', 'check symptoms', 'assessment']
            
            if any(keyword in message.lower() for keyword in epds_keywords):
                log_debug("EPDS keyword detected, transitioning to EPDS mode in JavaScript")
                # This will be handled by JavaScript, so we keep the state as USER_LED
                pass
            elif any(keyword in message.lower() for keyword in symptoms_keywords):
                log_debug("Symptoms keyword detected, transitioning to SYMPTOMS_QUESTIONNAIRE")
                self.user_states[user_id] = ConversationState.SYMPTOMS_QUESTIONNAIRE
        
        log_debug(f"New state: {self.user_states.get(user_id)}")
        log_debug(f"State transition: {current_state} -> {self.user_states.get(user_id)}")

    def get_response(self, user_id, message):
        """Get response to user message"""
        log_debug(f"Getting response for user {user_id}")
        log_debug(f"Incoming message: '{message}'")
        
        # Check if user wants to start a new conversation
        if message and message.strip().lower() == 'new':
            log_debug("User requested a new conversation - resetting state")
            self.reset_state(user_id)
            # Return only the greeting message
            return "Hi, I'm Sutkeri, your postpartum support companion"
        
        # If this is a new user, initialize the state
        if user_id not in self.user_states:
            log_debug("New user, initializing with GREETING state")
            self.user_states[user_id] = ConversationState.GREETING
            self.save_state(user_id)
            return "Hi, I'm Sutkeri, your postpartum support companion"
        
        # Get current state before updating
        current_state = self.user_states[user_id]
        
        # Update state based on user message
        self._update_state(user_id, message.strip().lower())
        
        # Get new state after update
        new_state = self.user_states[user_id]
        
        log_debug(f"State transition: {current_state} -> {new_state}")
        
        # Generate response based on the new state
        response = self.get_response_for_state(new_state, message)
        
        # Save the updated state after generating response
        self.save_state(user_id)
        
        log_debug(f"Response generated: '{response}'")
        return response

    def handle_symptoms_questionnaire(self, option):
        """Handle symptoms questionnaire based on user input"""
        log_debug(f"Handling symptoms questionnaire with input: '{option}'")
        
        option = option.strip().lower()
        
        # Initial symptoms questionnaire menu
        if not option or 'symptoms' in option or 'check' in option or 'assess' in option:
            return """I can help you assess common postpartum symptoms. Which area would you like to check?

1. 😔 Emotional symptoms (mood, anxiety, etc.)
2. 💭 Mental symptoms (concentration, memory, etc.)
3. 💤 Sleep issues
4. 💪 Physical recovery concerns
5. 👥 Social or relationship changes

Please choose a number (1-5), or type 'exit' to talk about something else."""
        
        # Validate if user entered a number outside the valid range
        if option.isdigit() and (int(option) < 1 or int(option) > 5):
            return """Please select a valid number between 1 and 5:

1. 😔 Emotional symptoms (mood, anxiety, etc.)
2. 💭 Mental symptoms (concentration, memory, etc.)
3. 💤 Sleep issues
4. 💪 Physical recovery concerns
5. 👥 Social or relationship changes

Please choose a number (1-5), or type 'exit' to talk about something else."""
        
        # Process specific symptom options
        if option == '1' or 'emotion' in option or 'mood' in option or 'anxiety' in option:
            return """Here's a quick assessment of common emotional symptoms after birth. Have you experienced any of these in the past 2 weeks?

• Persistent sadness or crying
• Feeling overwhelmed, worthless, or excessively guilty
• Loss of interest in activities you used to enjoy
• Withdrawing from family and friends
• Excessive worry or anxiety
• Anger or irritability that seems out of proportion
• Thoughts of harming yourself or your baby

If you're experiencing several of these symptoms, especially if they're intense or persistent, it's important to speak with your healthcare provider. Postpartum mood disorders are common and treatable.

Would you like to check another symptom area? If yes, please enter a number 1-5, or type 'exit' to return to our conversation."""
            
        elif option == '2' or 'mental' in option or 'concentration' in option or 'memory' in option:
            return """Here's a quick assessment of common mental symptoms after birth. Have you experienced any of these consistently?

• Difficulty concentrating or making decisions
• Forgetfulness or feeling mentally foggy
• Racing thoughts that are difficult to control
• Obsessive worries or intrusive thoughts
• Difficulty focusing on tasks
• Feeling detached or like you're "going through the motions"

Some mental changes are normal due to hormones, sleep disruption, and adjustment to new responsibilities. However, if these symptoms significantly interfere with your daily functioning, consider discussing them with your healthcare provider.

Would you like to check another symptom area? If yes, please enter a number 1-5, or type 'exit' to return to our conversation."""
            
        elif option == '3' or 'sleep' in option or 'insomnia' in option or 'rest' in option:
            return """Here's a quick assessment of common sleep issues after birth. Are you experiencing any of these?

• Difficulty falling asleep even when baby is sleeping
• Waking up with anxiety even when baby hasn't woken you
• Intense dreams or nightmares
• Feeling unrested even after getting some sleep
• Complete inability to nap or sleep when given the opportunity
• Racing thoughts that prevent sleep

While interrupted sleep is expected with a new baby, the issues above may indicate a sleep disorder that could benefit from professional guidance. Sleep disruption can significantly impact your recovery and mental health.

Would you like to check another symptom area? If yes, please enter a number 1-5, or type 'exit' to return to our conversation."""
            
        elif option == '4' or 'physical' in option or 'pain' in option or 'recovery' in option:
            return """Here's a quick assessment of physical recovery concerns. Are you experiencing any of these beyond what your provider indicated as normal?

• Pain or discomfort that isn't improving or is getting worse
• Excessive or changing pattern of bleeding
• Fever over 100.4°F (38°C)
• Severe headache, especially with vision changes
• Swelling, redness, or discharge from incisions
• Difficulty urinating or painful urination
• Chest pain or difficulty breathing

Any concerning physical symptoms should be reported to your healthcare provider promptly. Physical recovery is individual, but certain symptoms need immediate medical attention.

Would you like to check another symptom area? If yes, please enter a number 1-5, or type 'exit' to return to our conversation."""
            
        elif option == '5' or 'social' in option or 'relationship' in option:
            return """Here's a quick assessment of social and relationship changes. Have you noticed any of these since birth?

• Feelings of isolation or disconnection from others
• Significant strain in your relationship with your partner
• Difficulty bonding with your baby
• Feeling misunderstood by friends or family
• Avoiding social situations you would normally enjoy
• Feeling judged about your parenting choices

Changes in relationships are normal after having a baby, but persistent difficulties may benefit from additional support. Parent groups, counseling, or even honest conversations with loved ones can help address these challenges.

Would you like to check another symptom area? If yes, please enter a number 1-5, or type 'exit' to return to our conversation."""
            
        elif 'exit' in option or 'back' in option:
            return "We've finished the symptom assessment. Is there anything specific from the assessment you'd like to discuss further?"
            
        else:
            return """I'm not sure which symptom area you'd like to check. Could you please select a number (1-5)?

1. 😔 Emotional symptoms (mood, anxiety, etc.)
2. 💭 Mental symptoms (concentration, memory, etc.)
3. 💤 Sleep issues
4. 💪 Physical recovery concerns
5. 👥 Social or relationship changes

Or type 'exit' to return to our conversation."""


    def handle_pregnancy_info(self, option):
        """Handle pregnancy and postpartum depression information requests"""
        log_debug(f"Handling pregnancy info for option: '{option}'")
        
        option = option.strip().lower()
        if option.isdigit():
            option_num = option
            log_debug(f"Numeric option selected: {option_num}")
            
            # Validate if user entered a number outside the valid range
            if int(option_num) < 1 or int(option_num) > 5:
                return """Please select a valid number between 1 and 5:

1. What is postpartum depression
2. Causes of postpartum depression
3. Symptoms of postpartum depression
4. Prevention measures
5. Self-care tips

Please choose a number (1-5) or type "new" to start a new conversation:"""
        else:
            log_debug("Non-numeric option, returning initial question")
            return """What would you like to know:

1. What is postpartum depression
2. Causes of postpartum depression
3. Symptoms of postpartum depression
4. Prevention measures
5. Self-care tips

Please choose a number (1-5) or type "new" to start a new conversation:"""
            
        # Just return a simple response based on the number for now
        responses = {
            '1': "What is Postpartum Depression?\n\nPostpartum depression is a serious mental health condition that can develop after childbirth.",
            '2': "Causes of Postpartum Depression\n\nPostpartum depression can be caused by hormonal changes, lack of sleep, and many other factors.",
            '3': "Symptoms of Postpartum Depression\n\nSymptoms include persistent sadness, anxiety, fatigue, and difficulty bonding with your baby.",
            '4': "Prevention Measures\n\nPrevention includes getting support, rest, and talking openly about your feelings.",
            '5': "Self-care Tips\n\nSelf-care includes getting enough rest, eating well, and asking for help when needed."
        }
        
        return responses.get(option, "I didn't understand that option. Please choose a number from 1-5.")

    def assess_risk_level(self, message):
        """Assess the risk level based on symptoms"""
        if not message:
            return "low", "Thank you for sharing. These feelings are valid and you're not alone."
            
        message = message.lower()
        
        # Check for number selections that indicate high risk
        # Extract numbers from the message
        number_matches = re.findall(r'\b(\d+)\b', message)
        for num_str in number_matches:
            try:
                num = int(num_str)
                if 1 <= num <= 5:  # Numbers 1-5 are high risk symptoms
                    return "high", "I'm really concerned about how you're feeling. These symptoms are serious. You're not alone, and help is available. Please contact your healthcare provider immediately or go to the nearest emergency room. Your wellbeing is important, and these symptoms require prompt medical attention."
            except ValueError:
                pass
        
        # High risk symptoms - immediate medical attention needed
        high_risk_symptoms = [
            'suicidal', 'kill myself', 'end my life', 'don\'t want to live',
            'harm myself', 'harm my baby', 'hurt my baby', 'hurt myself',
            'severe bleeding', 'hemorrhage', 'can\'t breathe', 'chest pain',
            'seizure', 'convulsion', 'unconscious', 'passed out',
            'fever above 100.4', 'high fever', 'severe headache',
            'vision changes', 'blurry vision', 'spots in vision',
            'severe pain', 'unbearable pain', 'extreme pain',
            'thoughts of death', 'hallucination', 'seeing things', 'hearing voices',
            'can\'t move', 'paralysis', 'stroke', 'blood clot'
        ]
        
        # Medium risk symptoms - medical attention recommended soon
        medium_risk_symptoms = [
            'depression', 'depressed', 'hopeless', 'worthless', 'empty inside',
            'anxiety', 'anxious', 'panic attack', 'constant worry',
            'can\'t sleep', 'insomnia', 'no sleep for days',
            'no appetite', 'not eating', 'weight loss',
            'infection', 'pus', 'foul smell', 'bad odor',
            'incision pain', 'wound not healing', 'stitches opened',
            'breast pain', 'mastitis', 'breast infection',
            'crying all day', 'crying constantly', 'can\'t stop crying',
            'disconnected from baby', 'don\'t feel bonded', 'don\'t care about baby',
            'angry all the time', 'rage', 'uncontrollable anger',
            'paranoid', 'suspicious', 'everyone is against me'
        ]
        
        # Check for high risk symptoms first (most urgent)
        for symptom in high_risk_symptoms:
            if symptom in message:
                return "high", "I'm really concerned about how you're feeling. These symptoms are serious. You're not alone, and help is available. Please contact your healthcare provider immediately or go to the nearest emergency room. Your wellbeing is important, and these symptoms require prompt medical attention."
        
        # Check for medium risk symptoms
        for symptom in medium_risk_symptoms:
            if symptom in message:
                return "medium", "It sounds like you're going through some challenging adjustments. These symptoms are common but should be monitored closely. I recommend discussing them with your healthcare provider at your next appointment or sooner if they worsen. Taking care of your health is an important part of caring for your baby too."
        
        # Default to low risk if no high or medium risk symptoms detected
        return "low", "Thank you for sharing. These feelings are valid and you're not alone. Many new parents experience similar symptoms, and they often improve with time, rest, and support. Continue practicing self-care and reach out to friends, family, or support groups when you need help."

    def identify_symptoms(self, message):
        """Identify symptoms from user message"""
        if not message:
            return ["• General postpartum concerns"]
            
        message = message.lower()
        symptoms = []
        
        # Check for number-based selections first (1, 2, 3, etc.)
        # Extract numbers from the message
        number_matches = re.findall(r'\b(\d+)\b', message)
        
        # Map numbers to high-risk symptom descriptions
        symptom_map = {
            1: "• ⚠️ Thoughts about harming yourself or your baby",
            2: "• ⚠️ Hallucinations or delusions",
            3: "• ⚠️ Complete inability to sleep even when exhausted",
            4: "• ⚠️ Extreme mood swings or rage episodes",
            5: "• ⚠️ Disconnection or lack of interest in baby"
        }
        
        # Check for number selections
        for num_str in number_matches:
            try:
                num = int(num_str)
                if 1 <= num <= 5:  # Valid selection range for high-risk symptoms
                    symptoms.append(symptom_map[num])
            except ValueError:
                pass
                
        # If number selections were found, return them
        if symptoms:
            return symptoms
            
        # Otherwise, continue with text-based symptom identification
        
        # Emotional symptoms
        if any(word in message for word in ["sad", "tear", "cry", "depress", "down", "blue", "unhappy", "upset"]):
            symptoms.append("• Feelings of sadness or tearfulness")
        if any(word in message for word in ["anx", "worry", "nervous", "stress", "tense", "on edge", "restless"]):
            symptoms.append("• Anxiety or excessive worry")
        if any(word in message for word in ["irritable", "angry", "frustrat", "annoy", "short temper", "rage"]):
            symptoms.append("• Irritability or anger")
        if any(word in message for word in ["overwhelm", "too much", "can't cope", "burden", "pressure"]):
            symptoms.append("• Feeling overwhelmed")
        if any(word in message for word in ["mood swing", "up and down", "emotional", "unstable mood"]):
            symptoms.append("• Mood swings")
        if any(word in message for word in ["guilt", "blame", "bad mother", "failure", "not good enough"]):
            symptoms.append("• Feelings of guilt or inadequacy")
        if any(word in message for word in ["disconnect", "detach", "bond", "love", "feel nothing", "numb"]):
            symptoms.append("• Difficulty bonding with baby")
        
        # Mental symptoms
        if any(word in message for word in ["fog", "distract", "forget", "focus", "concentrate", "memory", "think clearly"]):
            symptoms.append("• Mental fog or difficulty concentrating")
        if any(word in message for word in ["decision", "choose", "can't decide", "confused"]):
            symptoms.append("• Difficulty making decisions")
        if any(word in message for word in ["thought", "racing", "mind won't stop", "overthink"]):
            symptoms.append("• Racing thoughts")
        
        # Sleep issues
        if any(word in message for word in ["sleep", "insomnia", "awake", "can't rest", "tired", "exhausted", "fatigue"]):
            symptoms.append("• Sleep disturbances or fatigue")
        
        # Physical symptoms
        if any(word in message for word in ["pain", "discomfort", "hurt", "sore", "ache"]):
            symptoms.append("• Physical pain or discomfort")
        if any(word in message for word in ["bleed", "discharge", "infection", "fever", "incision", "tear", "swelling"]):
            symptoms.append("• Physical recovery complications")
        if any(word in message for word in ["appetite", "eat", "food", "weight", "hungry"]):
            symptoms.append("• Changes in appetite")
        if any(word in message for word in ["headache", "migraine", "head pain"]):
            symptoms.append("• Headaches")
        
        # Severe symptoms - use HIGH RISK tag to make them more visible
        if any(word in message for word in ["suicidal", "harm", "death", "kill", "end life", "don't want to live"]):
            symptoms.append("• ⚠️ HIGH RISK: Thoughts of self-harm or suicide")
        if any(word in message for word in ["hallucination", "seeing things", "hearing voices", "delusion"]):
            symptoms.append("• ⚠️ HIGH RISK: Hallucinations or delusions")
        
        # If no specific symptoms identified
        if len(symptoms) == 0:
            symptoms.append("• General postpartum concerns")
        
        return symptoms

    def identify_causes(self, symptoms):
        """Identify potential causes based on symptoms"""
        causes = []
        
        # Check for emotional symptoms
        if any("sad" in s or "tear" in s or "cry" in s or "depress" in s or "mood swing" in s or "overwhelm" in s or "irritable" in s or "angry" in s for s in symptoms):
            causes.append("• Hormonal changes - Dramatic drops in estrogen and progesterone after childbirth")
            causes.append("• Sleep deprivation - Fragmented sleep affecting mood regulation")
        
        # Check for anxiety symptoms
        if any("anx" in s or "worry" in s or "stress" in s or "tense" in s or "racing thought" in s for s in symptoms):
            causes.append("• Adjustment to new responsibilities and identity as a parent")
            causes.append("• Heightened protective instincts toward the baby")
        
        # Check for bonding issues
        if any("disconnect" in s or "bond" in s or "love" in s or "feel nothing" in s or "numb" in s for s in symptoms):
            causes.append("• Hormonal factors affecting emotional attachment")
            causes.append("• Exhaustion interfering with emotional capacity")
            causes.append("• Possible postpartum depression or anxiety")
        
        # Check for cognitive symptoms
        if any("fog" in s or "distract" in s or "forget" in s or "focus" in s or "concentrate" in s or "memory" in s or "decision" in s for s in symptoms):
            causes.append("• Sleep deprivation affecting cognitive function")
            causes.append("• Stress hormones impacting memory and concentration")
            causes.append("• Information overload from new parenting responsibilities")
        
        # Check for sleep issues
        if any("sleep" in s or "insomnia" in s or "awake" in s or "tired" in s or "exhausted" in s or "fatigue" in s for s in symptoms):
            causes.append("• Infant feeding schedule interrupting sleep cycles")
            causes.append("• Heightened alertness to baby's needs")
            causes.append("• Hormonal influences on sleep quality")
        
        # Check for physical symptoms
        if any("pain" in s or "discomfort" in s or "bleed" in s or "discharge" in s or "infection" in s or "fever" in s or "headache" in s for s in symptoms):
            causes.append("• Physical recovery from childbirth")
            causes.append("• Possible complications requiring medical attention")
            causes.append("• Muscle tension from new physical demands (holding baby, breastfeeding positions)")
        
        # Check for severe symptoms
        if any("suicidal" in s or "harm" in s or "hallucination" in s or "seeing things" in s or "hearing voices" in s for s in symptoms):
            causes.append("• Possible postpartum depression, anxiety, or psychosis requiring immediate medical attention")
            causes.append("• Severe hormonal imbalances affecting brain function")
            causes.append("• Extreme sleep deprivation affecting mental state")
        
        # If no specific causes identified
        if len(causes) == 0:
            causes.append("• Normal postpartum adjustment period")
            causes.append("• Hormonal changes following childbirth")
            causes.append("• Sleep disruption and physical recovery demands")
        
        return causes

    def identify_treatment(self, symptoms, risk_level):
        """Identify treatment recommendations based on symptoms and risk level"""
        treatment = []
        
        # High risk recommendations
        if risk_level == "high":
            treatment.append("• URGENT: Contact your healthcare provider immediately or go to the nearest emergency room")
            treatment.append("• Do not remain alone if experiencing thoughts of self-harm")
            treatment.append("• Call a crisis helpline: Nepal National Suicide Prevention Helpline 1166")
        # Medium risk recommendations
        elif risk_level == "medium":
            treatment.append("• Schedule an appointment with your healthcare provider within the next few days")
            treatment.append("• Discuss medication options with your doctor if symptoms persist")
            treatment.append("• Consider therapy or counseling specialized in postpartum adjustment")
            treatment.append("• Join a postpartum support group (online or in-person)")
        # Low risk recommendations
        else:
            treatment.append("• Monitor symptoms and discuss at your next routine check-up")
            treatment.append("• Reach out to family and friends for additional support")
            treatment.append("• Consider joining a new parents' group for community support")
        
        # Specific treatment recommendations based on symptoms
        if any("sad" in s or "tear" in s or "cry" in s or "depress" in s or "mood" in s for s in symptoms):
            treatment.append("• Talk therapy approaches like CBT (Cognitive Behavioral Therapy) have shown effectiveness for postpartum mood issues")
        
        if any("anx" in s or "worry" in s or "stress" in s or "tense" in s for s in symptoms):
            treatment.append("• Mindfulness and breathing exercises can help manage anxiety symptoms")
        
        if any("sleep" in s or "insomnia" in s or "awake" in s or "tired" in s or "exhausted" in s or "fatigue" in s for s in symptoms):
            treatment.append("• Discuss sleep strategies with your healthcare provider")
            treatment.append("• Consider sleep shifts with a partner or support person if possible")
        
        if any("pain" in s or "discomfort" in s or "bleed" in s or "discharge" in s or "infection" in s or "fever" in s for s in symptoms):
            treatment.append("• Follow up with your healthcare provider about physical symptoms")
            treatment.append("• Take prescribed medications as directed for pain or infection")
        
        return treatment

    def identify_self_care(self, symptoms):
        """Identify self-care tips based on symptoms"""
        self_care = []
        
        # General self-care tips for all postpartum individuals
        self_care.append("• Prioritize sleep when possible - rest when your baby rests")
        self_care.append("• Accept help from others with household tasks and baby care")
        self_care.append("• Stay hydrated and eat nutritious, easy-to-prepare foods")
        
        # Specific self-care tips based on symptoms
        if any("sad" in s or "tear" in s or "cry" in s or "depress" in s or "mood" in s or "overwhelm" in s for s in symptoms):
            self_care.append("• Spend brief periods outdoors daily - natural light can help mood")
            self_care.append("• Express feelings through journaling or talking with a trusted person")
            self_care.append("• Remember that having difficult feelings doesn't make you a bad parent")
        
        if any("anx" in s or "worry" in s or "stress" in s or "tense" in s for s in symptoms):
            self_care.append("• Practice 5-minute breathing exercises several times daily")
            self_care.append("• Limit exposure to stressful media and information overload")
            self_care.append("• Focus on one moment at a time rather than worrying about the future")
        
        if any("fog" in s or "distract" in s or "forget" in s or "focus" in s or "concentrate" in s or "memory" in s for s in symptoms):
            self_care.append("• Use reminder apps or notes for important information")
            self_care.append("• Break tasks into smaller, manageable steps")
            self_care.append("• Be patient with yourself - 'mom brain' is a normal experience")
        
        if any("sleep" in s or "insomnia" in s or "awake" in s or "tired" in s or "exhausted" in s or "fatigue" in s for s in symptoms):
            self_care.append("• Create a calming bedtime routine for yourself")
            self_care.append("• Limit screen time before bed to improve sleep quality")
            self_care.append("• Consider a white noise machine to help maintain sleep")
        
        if any("pain" in s or "discomfort" in s or "physical" in s for s in symptoms):
            self_care.append("• Apply warm compresses for muscle soreness (if approved by your provider)")
            self_care.append("• Practice gentle stretching for tension relief")
            self_care.append("• Use proper body mechanics when lifting and carrying your baby")
        
        return self_care

    def generate_symptom_report(self, message):
        """Generate a structured symptom report"""
        # Identify reported symptoms
        symptoms = self.identify_symptoms(message)
        
        # Assess risk level
        risk_level, risk_response = self.assess_risk_level(message)
        log_debug(f"Risk assessment: {risk_level} risk")
        
        # Get causes based on identified symptoms
        causes = self.identify_causes(symptoms)
        
        # Get treatment recommendations based on symptoms and risk level
        treatment = self.identify_treatment(symptoms, risk_level)
        
        # Get self-care tips based on symptoms
        self_care = self.identify_self_care(symptoms)
        
        # Format the report
        report = f"""
📋 POSTPARTUM ASSESSMENT REPORT 📋

🔍 REPORTED SYMPTOMS:
{chr(10).join(symptoms)}

⚠️ RISK LEVEL: {risk_level.upper()}
{risk_response}

🔎 POSSIBLE CAUSES:
{chr(10).join(causes)}

💊 RECOMMENDED ACTIONS:
{chr(10).join(treatment)}

💗 SELF-CARE TIPS:
{chr(10).join(self_care)}

You're taking an important step by seeking support. Remember that healing takes time, and you're doing a great job navigating this challenging period.

DISCLAIMER: This chatbot provides informational support only and is not a substitute for professional medical advice. Always consult with your healthcare provider for medical concerns.

Type "new" to start a new conversation.
"""
        return report

    def get_response_for_state(self, new_state, message=None):
        """Get a response based on the current conversation state."""
        
        # Common response templates
        if new_state == ConversationState.GREETING:
            return "Hi, I'm Sutkeri, your postpartum support companion"
            
        elif new_state == ConversationState.PERMISSION_ASK:
            return "Is it okay if I ask you a few questions?\n\n1. Yes\n2. No"
            
        elif new_state == ConversationState.AWAITING_AGE:
            # Check if this is coming from a "no" response to permission question
            if message and any(word in message.lower() for word in ['no', 'nope', 'nah', '2']):
                return "I understand. To provide the most relevant information, may I at least ask your age?"
            else:
                return "To give you the best support, may I ask your age?"
            
        elif new_state == ConversationState.AGE_VERIFICATION_FAILED:
            return "I understand you're looking for help. Because you're under 18, it's a good idea to speak with a parent or healthcare provider. Could you please tell me your age?"
            
        elif new_state == ConversationState.IN_PREGNANCY_INFO:
            return """What would you like to know:

1. What is postpartum depression
2. Causes of postpartum depression
3. Symptoms of postpartum depression
4. Prevention measures
5. Self-care tips

Please choose a number (1-5) or type "new" to start a new conversation:"""

        elif new_state == ConversationState.SYMPTOMS_QUESTION:
            return self.generate_symptom_report(message or "")
            
        elif new_state == ConversationState.USER_LED:
            # Check if we're coming from age input
            if message and message.isdigit():
                return """Thank you for sharing your age. Before providing relevant support, I'd like to ask some questions to see whether you're experiencing postpartum depression symptoms.

Would you like to take the Edinburgh Postnatal Depression Scale (EPDS)? This validated screening tool will help determine if you might be experiencing postpartum depression.

Please reply with 'yes' to begin the questionnaire, or 'no' if you'd prefer to discuss something else first."""
            
            # Check if user is responding to EPDS prompt
            if message:
                message_lower = message.lower()
                if any(word in message_lower for word in ['yes', 'y', 'yeah', 'sure', 'ok']):
                    return "I'll help you complete the Edinburgh Postnatal Depression Scale (EPDS) questionnaire. Please answer honestly about how you've been feeling in the past 7 days."
                elif any(word in message_lower for word in ['no', 'n', 'nope', 'nah']):
                    return "That's okay. If you'd like to discuss postpartum depression symptoms or concerns later, just type 'EPDS' or 'assessment' anytime. How else can I help you today?"
            
            # Default response for USER_LED state
            return "I'm here to support you. To best help you, I recommend taking the Edinburgh Postnatal Depression Scale (EPDS) questionnaire to screen for postpartum depression. Type 'yes' to begin."
            
        elif new_state == ConversationState.SYMPTOMS_QUESTIONNAIRE:
            return """I can help you assess common postpartum symptoms. Which area would you like to check?

1. Emotional symptoms (mood, anxiety, etc.)

2. Mental symptoms (concentration, memory, etc.)

3. Sleep issues

4. Physical recovery concerns

5. Social or relationship changes

Please choose a number (1-5), or type 'exit' to talk about something else."""
        
        else:
            # Default response for unknown states
            return "I'm here to support you. How can I help you today?"

def main():
    print("===== CHATBOT STARTED =====", file=sys.stderr)
    try:
        parser = argparse.ArgumentParser(description="Chatbot command-line tool")
        parser.add_argument('--user', required=True, help="User ID for the session")
        parser.add_argument('--message', default="", help="Direct message from the user")
        parser.add_argument('--message-file', help="File containing the message from the user")
        parser.add_argument('--first-run', action='store_true', help="Flag for initial greeting")
        args = parser.parse_args()
        
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
                
            # Print response directly to stdout
            log_debug(f"Response generated: '{response}'")
            print(response)
            
            # Save the final state
            chatbot.save_state(args.user)
        
        except Exception as e:
            log_debug(f"Critical error in main function: {e}")
            log_debug(traceback.format_exc())
            print("I'm sorry, I couldn't process your message. Please try again.")
            return
            
    except Exception as e:
        log_debug(f"Unexpected error: {e}")
        log_debug(traceback.format_exc())
        print("An unexpected error occurred. Please try again.")

if __name__ == "__main__":
    main()
    log_debug("===== CHATBOT FINISHED =====")