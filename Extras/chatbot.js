import express from 'express';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Configure paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, '..', 'temp');

const router = express.Router();

// Ensure temp directory exists
async function ensureTempDir() {
    try {
        await fs.mkdir(TEMP_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating temp directory:', error);
    }
}

// Initialize
ensureTempDir();

// Common postpartum care responses for different topics
const commonResponses = {
    breastfeeding: {
        tips: [
            "Find a comfortable position that works for both you and your baby",
            "Ensure proper latch - baby's mouth should cover most of the areola",
            "Stay hydrated and maintain a nutritious diet",
            "Use lanolin cream for sore nipples",
            "Consider consulting a lactation consultant for personalized guidance"
        ],
        concerns: [
            "Pain beyond initial discomfort may indicate improper latch",
            "Cracked or bleeding nipples need immediate attention",
            "Low milk supply can be addressed with increased frequency of feeding",
            "Blocked ducts feel like painful lumps and need gentle massage"
        ]
    },
    recovery: {
        physical: [
            "Rest as much as possible - sleep when your baby sleeps",
            "Use ice packs and sitz baths for perineal discomfort",
            "Keep the incision area clean and dry if you had a C-section",
            "Practice gentle pelvic floor exercises when approved by your doctor",
            "Take pain medication as prescribed by your healthcare provider"
        ],
        emotional: [
            "Baby blues are normal and usually pass within two weeks",
            "Persistent feelings of sadness or anxiety could indicate postpartum depression",
            "Don't hesitate to seek professional help if you're struggling",
            "Connect with other new parents through support groups"
        ]
    },
    babycare: {
        basics: [
            "Change diapers frequently to prevent rash and discomfort",
            "Support your baby's head and neck when holding them",
            "Bathe your baby 2-3 times per week with gentle products",
            "Dress your baby in one more layer than what's comfortable for you",
            "Learn to recognize your baby's hunger cues"
        ],
        sleep: [
            "Always place baby on their back to sleep",
            "Establish a consistent bedtime routine",
            "Keep the room at a comfortable temperature (68-72°F)",
            "Use a firm mattress with a fitted sheet in the crib",
            "Consider swaddling for babies under 2 months"
        ]
    },
    mentalHealth: {
        warning: [
            "Feeling sad or hopeless for more than two weeks",
            "Having thoughts of harming yourself or your baby",
            "Feeling disconnected from your baby",
            "Excessive worry or anxiety that interferes with daily activities",
            "Changes in appetite or sleep unrelated to baby care"
        ],
        support: [
            "Speak with your healthcare provider about your feelings",
            "Join a postpartum support group",
            "Accept help from family and friends",
            "Practice self-care activities when possible",
            "Consider therapy or medication if recommended"
        ]
    }
};

// Paragraph format responses for explanation-type questions
const paragraphResponses = {
    postpartumDepression: {
        what: "Postpartum depression (PPD) is a serious mood disorder that affects approximately 1 in 7 women after childbirth. It goes beyond the normal 'baby blues' and involves persistent feelings of sadness, anxiety, and exhaustion that can interfere with daily functioning. PPD is caused by a combination of physical, emotional, and hormonal changes, along with the stress and sleep deprivation that accompany caring for a newborn. It is a medical condition requiring proper treatment, not a character flaw or weakness.",
        why: "Postpartum depression develops due to multiple interrelated factors. The dramatic hormonal changes after delivery (rapid drops in estrogen and progesterone) affect brain chemistry and mood regulation. This biological shift combines with the physical exhaustion of recovery and sleep deprivation. Additionally, the psychological adjustment to parenthood, including identity changes, new responsibilities, and potential birth trauma, creates emotional vulnerability. Women with previous depression, limited support systems, or pregnancy complications face higher risks. These biological and psychosocial factors together create the conditions for postpartum depression to develop.",
        treatment: "Treatment for postpartum depression typically involves a combination of approaches tailored to each woman's needs. Psychotherapy (particularly cognitive-behavioral therapy) helps mothers develop coping strategies and process difficult emotions. Antidepressant medications may be prescribed, with certain options being safe during breastfeeding. Support groups connect mothers with others experiencing similar challenges, reducing isolation. Self-care measures like sleep prioritization, physical activity, and nutrition are essential components. For severe cases, more intensive treatments may be needed. Early intervention leads to better outcomes, so seeking help promptly is crucial."
    },
    breastfeeding: {
        why: "Breastfeeding provides numerous benefits for both babies and mothers. For babies, breast milk contains the perfect balance of nutrients, antibodies, and growth factors that strengthen the immune system, promote healthy weight, and reduce the risk of many conditions including infections, allergies, asthma, SIDS, and certain chronic diseases. For mothers, breastfeeding promotes faster recovery from childbirth, helps the uterus return to pre-pregnancy size, reduces the risk of breast and ovarian cancers, and creates opportunities for bonding. It also releases hormones that promote relaxation and attachment between mother and baby.",
        how: "Successful breastfeeding begins with proper positioning and latch. Hold your baby skin-to-skin, with their belly facing yours and their head aligned with your breast. Wait for your baby to open wide, then bring them quickly to your breast, aiming their lower lip well below your nipple. Their mouth should cover a large portion of the areola, not just the nipple. You'll know the latch is good when you see rounded cheeks, hear swallowing, and feel gentle tugging without pain. Feed on demand (typically 8-12 times daily), switching sides each session. Seek help from a lactation consultant if you experience pain or difficulties."
    },
    babycare: {
        sleep: "Newborn sleep is characterized by short cycles and frequent waking, typically totaling 14-17 hours daily in 2-3 hour segments. This pattern reflects their small stomachs needing frequent feeding and their developing nervous systems. Most babies don't develop mature sleep patterns until 3-6 months. To promote healthy sleep, establish consistent bedtime routines with dimmed lights, gentle activities, and minimal stimulation. Always place babies on their backs on firm, flat surfaces without blankets or toys to reduce SIDS risk. Room-sharing (but not bed-sharing) for the first 6-12 months is recommended for safety while facilitating easier feeding and monitoring.",
        crying: "Crying is a baby's primary communication method, signaling various needs including hunger, discomfort, overstimulation, or desire for connection. Newborns typically cry 2-3 hours daily, peaking around 6-8 weeks before gradually decreasing. When your baby cries, systematically check for hunger, dirty diaper, temperature discomfort, or desire to be held. Many babies respond well to the 5 S's: swaddling, side/stomach position (while awake), shushing, swinging, and sucking. If crying is excessive (more than 3 hours daily for more than 3 days weekly) or sounds unusual, consult your pediatrician to rule out medical causes like colic or reflux."
    }
};

// Topic introduction labels
const topicIntros = {
    breastfeeding: {
        tips: "Effective breastfeeding techniques include:",
        concerns: "Common breastfeeding concerns to watch for are:"
    },
    recovery: {
        physical: "For physical recovery after childbirth:",
        emotional: "To support your emotional wellbeing:"
    },
    babycare: {
        basics: "Essential newborn care practices include:",
        sleep: "Safe sleep guidelines for your baby are:"
    },
    mentalHealth: {
        warning: "Warning signs of postpartum depression include:",
        support: "Steps to support your mental health include:"
    }
};

// Process message using Python chatbot
async function processPythonChatbot(message) {
    try {
        const tempInputFile = path.join(TEMP_DIR, `input_${Date.now()}.txt`);
        const tempOutputFile = path.join(TEMP_DIR, `output_${Date.now()}.txt`);
        
        // Write message to temporary file
        await fs.writeFile(tempInputFile, message);
        
        // Execute Python script with input file
        return new Promise((resolve, reject) => {
            const pythonCommand = `python chatbot.py --input "${tempInputFile}" --output "${tempOutputFile}"`;
            
            exec(pythonCommand, async (error, stdout, stderr) => {
                try {
                    if (error) {
                        console.error(`Python execution error: ${error.message}`);
                        // Fall back to rule-based response
                        resolve(generateRuleBasedResponse(message));
                        return;
                    }
                    
                    // Try to read output file
                    try {
                        const output = await fs.readFile(tempOutputFile, 'utf8');
                        resolve(output.trim());
                    } catch (readError) {
                        console.error(`Error reading output file: ${readError.message}`);
                        resolve(generateRuleBasedResponse(message));
                    }
                    
                    // Clean up temp files
                    try {
                        await fs.unlink(tempInputFile);
                        await fs.unlink(tempOutputFile);
                    } catch (unlinkError) {
                        console.error(`Error removing temp files: ${unlinkError.message}`);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    } catch (error) {
        console.error('Error in Python chatbot processing:', error);
        return generateRuleBasedResponse(message);
    }
}

// Determine if a question likely needs a paragraph response
function needsParagraphResponse(message) {
    const msg = message.toLowerCase();
    
    // Check for explanation-seeking words
    const explanationIndicators = [
        'why', 'how', 'what is', 'what are', 'explain', 
        'reason', 'cause', 'understand', 'mean', 'explain'
    ];
    
    return explanationIndicators.some(indicator => msg.includes(indicator));
}

// Generate rule-based response as fallback
function generateRuleBasedResponse(message) {
    const msg = message.toLowerCase();
    
    // Detect topics in the message
    const topics = {
        breastfeeding: ['breastfeed', 'breast feed', 'nursing', 'milk', 'pump', 'latch'],
        recovery: ['recovery', 'heal', 'pain', 'bleed', 'cramp', 'sore', 'stitches', 'c-section', 'cesarean'],
        babycare: ['diaper', 'bath', 'sleep', 'crying', 'colic', 'formula', 'feeding', 'rash'],
        mentalHealth: ['depress', 'sad', 'anxious', 'anxiety', 'overwhelm', 'cry', 'lonely', 'mood', 'emotion']
    };
    
    // Default response
    let response = {
        text: "Common postpartum concerns include breastfeeding challenges, physical recovery, baby care, and emotional wellbeing. Please specify which area you need information about.",
        suggestions: [
            "Breastfeeding challenges",
            "Pain after childbirth",
            "Baby sleep issues",
            "Postpartum emotions"
        ]
    };
    
    // Check if this is a question that needs a paragraph response
    if (needsParagraphResponse(msg)) {
        // Check for depression explanation questions
        if ((msg.includes('postpartum') || msg.includes('depress')) && 
            (msg.includes('what') || msg.includes('explain'))) {
            return {
                text: "What is postpartum depression:\n\n" + paragraphResponses.postpartumDepression.what,
                suggestions: [
                    "Causes of depression",
                    "Treatment options",
                    "Symptoms to watch for"
                ]
            };
        }
        
        // Check for depression cause/why questions
        if ((msg.includes('postpartum') || msg.includes('depress')) && 
            (msg.includes('why') || msg.includes('cause'))) {
            return {
                text: "Why postpartum depression occurs:\n\n" + paragraphResponses.postpartumDepression.why,
                suggestions: [
                    "Treatment options",
                    "Symptoms to watch for",
                    "When to get help"
                ]
            };
        }
        
        // Check for depression treatment questions
        if ((msg.includes('postpartum') || msg.includes('depress')) && 
            (msg.includes('treat') || msg.includes('help') || msg.includes('therapy'))) {
            return {
                text: "Treatment for postpartum depression:\n\n" + paragraphResponses.postpartumDepression.treatment,
                suggestions: [
                    "Self-care strategies",
                    "Finding a therapist",
                    "Support groups"
                ]
            };
        }
        
        // Check for breastfeeding why/benefits questions
        if (msg.includes('breastfeed') && 
            (msg.includes('why') || msg.includes('benefit'))) {
            return {
                text: "Benefits of breastfeeding:\n\n" + paragraphResponses.breastfeeding.why,
                suggestions: [
                    "Breastfeeding techniques",
                    "Common challenges",
                    "Increasing milk supply"
                ]
            };
        }
        
        // Check for breastfeeding how questions
        if (msg.includes('breastfeed') && 
            (msg.includes('how') || msg.includes('technique') || msg.includes('position'))) {
            return {
                text: "How to breastfeed effectively:\n\n" + paragraphResponses.breastfeeding.how,
                suggestions: [
                    "Fixing latch problems",
                    "Increasing milk supply",
                    "Breastfeeding positions"
                ]
            };
        }
        
        // Check for baby sleep questions
        if ((msg.includes('baby') || msg.includes('infant') || msg.includes('newborn')) && 
            (msg.includes('sleep') && (msg.includes('how') || msg.includes('why')))) {
            return {
                text: "Understanding newborn sleep:\n\n" + paragraphResponses.babycare.sleep,
                suggestions: [
                    "Sleep training",
                    "Safe sleep practices",
                    "Nap schedules"
                ]
            };
        }
        
        // Check for baby crying questions
        if ((msg.includes('baby') || msg.includes('infant') || msg.includes('newborn')) && 
            (msg.includes('cry') || msg.includes('colic')) && 
            (msg.includes('why') || msg.includes('how'))) {
            return {
                text: "Understanding baby crying:\n\n" + paragraphResponses.babycare.crying,
                suggestions: [
                    "Soothing techniques",
                    "Colic remedies",
                    "When to call the doctor"
                ]
            };
        }
    }
    
    // Check for specific questions about symptoms (bullet points format)
    if (msg.includes('symptom') && msg.includes('depress')) {
        return {
            text: "Symptoms of postpartum depression include:\n\n• Persistent feelings of sadness or emptiness\n• Loss of interest in activities you used to enjoy\n• Severe mood swings or excessive crying\n• Withdrawing from family and friends\n• Thoughts of harming yourself or your baby\n\nConsult with your healthcare provider if you experience these symptoms.",
            suggestions: [
                "Treatment for depression",
                "Difference from baby blues",
                "When to get help"
            ]
        };
    }
    
    // Check for greetings
    if (/^(hi|hello|hey|greetings)/i.test(msg)) {
        return {
            text: "How can I help with your postpartum care today?",
            suggestions: [
                "Breastfeeding tips",
                "Recovery advice",
                "Baby care basics",
                "Postpartum emotions"
            ]
        };
    }
    
    // Check for emergency indicators
    const emergencyIndicators = ['hurt myself', 'harm myself', 'hurt my baby', 'harm my baby', 'suicidal', 'kill myself', 'end my life'];
    if (emergencyIndicators.some(indicator => msg.includes(indicator))) {
        return {
            text: "Please contact your healthcare provider immediately or call the National Suicide Prevention Lifeline at 1-800-273-8255. This requires immediate professional attention.",
            emergency: true
        };
    }
    
    // Process message by topic for bullet point responses
    for (const [topic, keywords] of Object.entries(topics)) {
        if (keywords.some(keyword => msg.includes(keyword))) {
            // Determine subtopic
            let subtopic = Object.keys(commonResponses[topic])[0]; // Default to first subtopic
            
            for (const sub of Object.keys(commonResponses[topic])) {
                // Simple heuristic to determine subtopic
                if (msg.includes(sub)) {
                    subtopic = sub;
                    break;
                }
            }
            
            // Get responses for the topic/subtopic
            const responses = commonResponses[topic][subtopic];
            
            // Select 3 random responses from the available ones
            const selectedResponses = [];
            const responsesCopy = [...responses];
            for (let i = 0; i < Math.min(3, responsesCopy.length); i++) {
                const index = Math.floor(Math.random() * responsesCopy.length);
                selectedResponses.push(responsesCopy[index]);
                responsesCopy.splice(index, 1);
            }
            
            // Get appropriate introduction for this topic/subtopic
            const introText = topicIntros[topic][subtopic];
            
            // Create direct answer with appropriate introductory text
            return {
                text: `${introText}\n\n• ${selectedResponses.join('\n• ')}\n\nConsult with your healthcare provider for personalized advice.`,
                suggestions: [
                    `More about ${topic}`,
                    "Other postpartum concerns",
                    "Thank you"
                ]
            };
        }
    }
    
    // Default response if no specific topic is detected
    return response;
}

// Message endpoint
router.post('/message', async (req, res) => {
    try {
        const { message, userId } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        // Try Python chatbot first (AI-powered responses)
        let response;
        try {
            const aiResponse = await processPythonChatbot(message);
            if (aiResponse && typeof aiResponse === 'string' && aiResponse.length > 20) {
                response = { text: aiResponse };
            } else {
                // Fall back to rule-based system
                response = generateRuleBasedResponse(message);
            }
        } catch (aiError) {
            console.error('AI chatbot error:', aiError);
            response = generateRuleBasedResponse(message);
        }
        
        // Add timestamps and message ID
        response.timestamp = new Date().toISOString();
        response.messageId = `msg_${Date.now()}`;
        
        res.json(response);
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Server error processing your message' });
    }
});

export default router; 