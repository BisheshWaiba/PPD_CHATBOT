"""
Module for generating structured symptom reports for the postpartum chatbot.
"""

def identify_symptoms(message):
    """Identify symptoms from user message"""
    if not message:
        return ["• General postpartum concerns"]
        
    message = message.lower()
    symptoms = []
    
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
    
    # Severe symptoms
    if any(word in message for word in ["suicidal", "harm", "death", "kill", "end life", "don't want to live"]):
        symptoms.append("• Thoughts of self-harm or suicide")
    if any(word in message for word in ["hallucination", "seeing things", "hearing voices", "delusion"]):
        symptoms.append("• Hallucinations or delusions")
    
    # If no specific symptoms identified
    if len(symptoms) == 0:
        symptoms.append("• General postpartum concerns")
    
    return symptoms

def identify_causes(symptoms):
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

def identify_treatment(symptoms, risk_level):
    """Identify treatment recommendations based on symptoms and risk level"""
    treatment = []
    
    # High risk recommendations
    if risk_level == "high":
        treatment.append("• URGENT: Contact your healthcare provider immediately or go to the nearest emergency room")
        treatment.append("• Do not remain alone if experiencing thoughts of self-harm")
        treatment.append("• Call a crisis helpline: National Maternal Mental Health Hotline (1-833-943-5746)")
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

def identify_self_care(symptoms):
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

def generate_symptom_report(message, risk_level, risk_response):
    """Generate a structured symptom report"""
    # Identify reported symptoms
    symptoms = identify_symptoms(message)
    
    # Get causes based on identified symptoms
    causes = identify_causes(symptoms)
    
    # Get treatment recommendations based on symptoms and risk level
    treatment = identify_treatment(symptoms, risk_level)
    
    # Get self-care tips based on symptoms
    self_care = identify_self_care(symptoms)
    
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

I'm here to support you through your postpartum journey. What specific aspect would you like to discuss further? Type "new" to start a new conversation.
"""
    return report 