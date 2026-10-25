// Chatbot client-side implementation
import {
    normalizeText, hasDevanagari, isYes, isNo, isNewCommand, isBackCommand,
    detectCrisis, crisisMessage, parseAge, parseBirthInput, birthTimingMessage,
    EPDS_LENGTH, EPDS_LANGUAGE_PROMPT, epdsIntro, formatEpdsQuestion, parseEpdsChoice, epdsPoints, buildEpdsResults,
    wellnessAndHelplines, classifyMessage, replyFor, numberedOptions, wantsAssistant,
    PPD_INFO, PPD_TOPICS_PROMPT, PREGNANCY_ENCOURAGEMENT, SYMPTOM_MENU, SYMPTOM_AREAS
} from './chat-logic.js';
import { createRecorder } from './history-recorder.js';

document.addEventListener('DOMContentLoaded', function() {
    const chatContainer = document.querySelector('#chat-container, .chat-container') || document.querySelector('#chat-messages');
    const messageInput = document.getElementById('message-input');
    const chatForm = document.getElementById('chat-form');
    const sendButton = document.getElementById('send-button');
    if (messageInput) messageInput.maxLength = 500;
    
    let isProcessing = false;

    // The AI conversation (/api/v1/assistant). It is only on when the server has an API key. If it
    // ever fails, the chat uses its fixed, reviewed replies instead and tries the AI again later.
    let assistantOn = false;
    let assistantPausedUntil = 0;        // after a failure, leave the AI alone for a minute
    let lastReplyFromAssistant = false;  // the AI spoke last, so a short "yes" answers the AI
    let transcript = [];                 // what was said in this chat: { role: 'user' | 'bot', text }

    // Saves each message to the signed-in account (see the History page)
    const recorder = createRecorder((method, path, body) => window.MOMAuth.apiFetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
    }));
    
    // Simulated conversation state
    let conversationState = 'GREETING'; // GREETING, AWAITING_AGE, AGE_VERIFICATION_FAILED, AWAITING_CHILD_BIRTHDATE, etc.
    
    // Make conversation state available globally for debugging
    window.conversationState = conversationState;
    
    // Make processUserMessage and other functions global for debugging
    window.debugChatbot = {
        processUserMessage: null, // Will be set later
        setSymptomCheck: function() {
            conversationState = 'SYMPTOMS_QUESTIONNAIRE';
            window.conversationState = conversationState;
            console.log("✅ Manually set state to SYMPTOMS_QUESTIONNAIRE");
            addMessage("I can help you assess common postpartum symptoms. Which area would you like to check?\n\n1. 😔 Emotional symptoms (mood, anxiety, etc.)\n\n2. 💭 Mental symptoms (concentration, memory, etc.)\n\n3. 💤 Sleep issues\n\n4. 💪 Physical recovery concerns\n\n5. 👥 Social or relationship changes", false);
        },
        testSymptomResponse: function(number) {
            if (number < 1 || number > 5) {
                console.error("❌ Invalid symptom number. Must be 1-5.");
                return;
            }
            
            console.log("🧪 Testing symptom response for option:", number);
            
            // Set state and process the message
            conversationState = 'SYMPTOMS_QUESTIONNAIRE';
            window.conversationState = conversationState;
            
            // Process the user message with the number
            if (this.processUserMessage) {
                this.processUserMessage(number.toString());
            } else {
                console.error("❌ processUserMessage function not available");
            }
        }
    };
    
    // Buttons for the answers to the question that was just asked. Tapping one does exactly
    // what typing that answer would. Each is { label, run }.
    function buildQuickReplies(actions, isRetry) {
        const group = document.createElement('div');
        group.className = 'quick-replies';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', isRetry ? 'Try again' : 'Quick replies');
        // Lists (menus, the questionnaire's four answers) read better one under another, and so do
        // long answers. Short pairs such as Yes / No stay side by side.
        if (actions.length > 3 || actions.some((action) => action.label.length > 28)) group.classList.add('stacked');

        actions.forEach((action) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'quick-reply';
            button.textContent = action.label;
            button.addEventListener('click', (event) => {
                if (isProcessing) return;
                action.run();
                // Pressed from the keyboard (no pointer): keep the person's place by going back to
                // the message box. A tap must not pop up the on-screen keyboard, so it does not.
                if (event.detail === 0) messageInput.focus();
            });
            group.appendChild(button);
        });
        return group;
    }

    // Old buttons stop being answers once anything else is said
    function clearQuickReplies() {
        chatContainer.querySelectorAll('.quick-replies').forEach((group) => group.remove());
    }

    // Function to add a message to the chat.
    // extras.actions: buttons to show under a bot message. extras.isError: style it as a failure.
    function addMessage(content, isUser = false, isLoading = false, extras = {}) {
        if (!isLoading) clearQuickReplies();

        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = isUser ? 'user-message' : 'bot-message';
        messageDiv.classList.add('message'); // Always add the message class
        if (isLoading) messageDiv.classList.add('loading');
        
        // Create avatar for bot message
        if (!isUser) {
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'message-avatar';
            
            // Add heart icon - always static
            const heartIcon = document.createElement('i');
            heartIcon.className = 'fas fa-heart';
            
            avatarDiv.appendChild(heartIcon);
            messageDiv.appendChild(avatarDiv);
        }
        
        // Create message content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (isLoading) {
            // Create a separate loading indicator div
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading-indicator';
            loadingDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
            contentDiv.appendChild(loadingDiv);
        } else {
            // Handle multi-line content with proper formatting
            if (content.includes('\n')) {
                content.split('\n').forEach((line, index, array) => {
                    if (line.trim()) {
                        const paragraph = document.createElement('p');
                        // Check if line contains HTML (like <a> links)
                        if (!isUser && !extras.plain && line.includes('<a') && line.includes('</a>')) {
                            paragraph.innerHTML = line; // Use innerHTML for lines with HTML
                        } else {
                            paragraph.textContent = line; // Use textContent for plain text lines
                        }
                        contentDiv.appendChild(paragraph);
                    }
                    
                    // Add a line break if not the last line and not empty
                    if (index < array.length - 1 && line.trim()) {
                        contentDiv.appendChild(document.createElement('br'));
                    }
                });
            } else {
                // Check if content contains HTML
                if (!isUser && !extras.plain && content.includes('<a') && content.includes('</a>')) {
                    contentDiv.innerHTML = content; // Use innerHTML for content with HTML
                } else {
                    contentDiv.textContent = content; // Use textContent for plain text content
                }
            }
        }
        
        if (!isUser && !isLoading) {
            if (extras.isError) {
                messageDiv.classList.add('message-error');
                contentDiv.setAttribute('role', 'alert');
            }
            if (extras.actions && extras.actions.length) {
                contentDiv.appendChild(buildQuickReplies(extras.actions, Boolean(extras.isError)));
            }
        }

        messageDiv.appendChild(contentDiv);

        // For user messages, add avatar at the end
        if (isUser) {
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'message-avatar';
            const avatarText = document.createElement('i');
            avatarText.className = 'fas fa-user';
            avatarDiv.appendChild(avatarText);
            messageDiv.appendChild(avatarDiv);
        }
        
        // Append the message to the chat container
        const footerSpace = document.querySelector('.footer-space');
        if (footerSpace) {
            chatContainer.insertBefore(messageDiv, footerSpace);
        } else {
            chatContainer.appendChild(messageDiv);
        }
        
        // Scroll to bottom immediately
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Keep a copy in the person's chat history. The typing dots and the "something went
        // wrong" notice are not part of the conversation.
        if (!isLoading && !extras.isError) {
            recorder.record(isUser ? 'user' : 'bot', content);
            transcript.push({ role: isUser ? 'user' : 'bot', text: content });
        }

        return messageDiv;
    }
    
    // Initialize chat
    // Is the AI conversation switched on? Asked once, with a short wait, before the welcome.
    async function loadAssistantStatus() {
        try {
            const response = await window.MOMAuth.apiFetch('/api/v1/assistant', { timeoutMs: 2500 });
            if (response.ok) assistantOn = Boolean((await response.json()).data?.enabled);
        } catch (error) {
            assistantOn = false;
        }
    }

    async function initializeChat() {
        // Nobody is signed in: the shared script is already sending the visitor to sign in, so do
        // not start a chat, or ask the server anything, only to get a 401 as the page goes away
        if (!window.MOMAuth.isAuthenticated()) return;
        await loadAssistantStatus();
        const chatbox = document.getElementById('chatbox');
        const userMessage = document.getElementById('user-message');
        
        // Optional extra logging: add ?debug=true to the address
        const debugMode = new URLSearchParams(window.location.search).get('debug') === 'true';
        window.chatbotDebugMode = debugMode;

        if (debugMode) {
            console.log("🔍 DEBUG MODE ENABLED - Detailed logging will be shown");
        }

        // Display the improved welcome and consent message with hand wave emoji
        addMessage("Hi there! 👋\n\nThank you for being here. Before we start, please take a moment to review:\n\nThis chatbot provides mental health support and helpful information for mothers after childbirth.\n\n This is not a substitute for professional help. If you're in crisis, please reach out to a healthcare provider.\n\nI can only help with postpartum wellbeing, so I won't be able to answer other questions.\n\nYour chats are saved to your account so you can look back at them later. You can delete them any time from History.\n\n" + (assistantOn ? "When we talk freely, an AI model writes my replies. It sees your latest messages, which are sent to the AI provider (Anthropic) to do that, so please don't share your full name, phone number or address.\n\n" : "") + "If you're okay with this, type 'continue' to begin chatting. 💬", false, false, {
            actions: [{ label: 'Continue', run: () => handleUserMessage('continue', 'Continue') }]
        });
        conversationState = 'AWAITING_CONTINUE';
        window.conversationState = conversationState;
    }
    
    // ----- Conversation ----------------------------------------------------------------
    // All wording, scoring and "what may I answer" rules live in /js/chat-logic.js.
    // This part only walks the conversation from one step to the next.

    const AGE_PROMPT = 'To give you the best support, may I ask your age?';
    const BIRTH_PROMPT = 'When was your baby born? You can type the date (for example 2025/12/25, or a Nepali date such as 2082/09/10), or something like "3 weeks ago". If your baby hasn\'t been born yet, type "not yet".';
    const START_PROMPT = "To better support you, we can go through a few short questions about how you've been feeling. Would you like to start? (Yes / No)";
    const INFO_FOOTER = '\n\nType "menu" to see what else I can help with.';

    // 'postpartum' for mothers who have given birth, 'pregnant' for the pregnancy path
    let infoMode = 'postpartum';

    function setState(state) {
        conversationState = state;
        window.conversationState = state;
    }

    // Nepali only when the user writes Nepali, so an old choice never changes the language of a new chat
    function replyLanguage(message) {
        return hasDevanagari(message) ? 'nepali' : 'english';
    }

    function epdsLanguage() {
        return localStorage.getItem('epdsLanguage') === 'nepali' ? 'nepali' : 'english';
    }

    function readEpdsAnswers() {
        try {
            const saved = JSON.parse(localStorage.getItem('epdsAnswers'));
            return Array.isArray(saved) ? saved : [];
        } catch (e) {
            return [];
        }
    }

    function saveEpdsAnswers(answers) {
        localStorage.setItem('epdsAnswers', JSON.stringify(answers));
        localStorage.setItem('epdsCurrentQuestion', String(answers.length + 1));
        localStorage.setItem('epdsScore', String(answers.reduce((sum, answer, i) => sum + epdsPoints(i, answer), 0)));
    }

    function startEpds(language) {
        localStorage.setItem('epdsLanguage', language);
        saveEpdsAnswers([]);
        setState('EPDS_START');
        return epdsIntro(language) + '\n\n' + formatEpdsQuestion(language, 0);
    }

    function handleEpdsAnswer(message) {
        const language = epdsLanguage();
        const answers = readEpdsAnswers();

        if (isBackCommand(message)) {
            if (answers.length === 0) {
                return "That is the first question, so there is nothing to go back to.\n\n" + formatEpdsQuestion(language, 0);
            }
            answers.pop();
            saveEpdsAnswers(answers);
            return formatEpdsQuestion(language, answers.length);
        }

        const choice = parseEpdsChoice(message);
        if (choice === null) {
            const hint = language === 'nepali'
                ? 'कृपया १ देखि ४ सम्मको नम्बर मात्र लेख्नुहोस्।'
                : 'Please reply with just a number from 1 to 4.';
            return hint + '\n\n' + formatEpdsQuestion(language, answers.length);
        }

        answers.push(choice);
        saveEpdsAnswers(answers);
        if (answers.length < EPDS_LENGTH) {
            return formatEpdsQuestion(language, answers.length);
        }

        localStorage.setItem('epdsCompletedAt', new Date().toISOString());
        setState('USER_LED');
        return buildEpdsResults(answers, language);
    }

    function handleAge(message) {
        const result = parseAge(message);
        if (result.status === 'invalid') {
            return 'Could you please tell me your age as a number (for example 27)?';
        }
        if (result.status === 'check') {
            return 'That age looks unusual. Could you please type your age in years, as a number?';
        }
        localStorage.setItem('userAge', String(result.age));
        setState('AWAITING_CHILD_BIRTHDATE');
        if (result.status === 'minor') {
            return "Thank you for telling me. Because you're under 18, it can also help to talk with a parent, a family member or a health worker you trust. I'm glad to continue with you.\n\n" + BIRTH_PROMPT;
        }
        return 'Thank you. ' + BIRTH_PROMPT;
    }

    function handleBirthDate(message) {
        const result = parseBirthInput(message);
        const futureReply = "That date is in the future. Please check it and type your baby's birth date again, or type \"not yet\" if your baby hasn't been born.";

        if (result.kind === 'not_born') {
            infoMode = 'pregnant';
            setState('IN_PREGNANCY_INFO');
            return PPD_TOPICS_PROMPT;
        }
        if (result.kind === 'skip') {
            setState('BIRTH_TIMING_RESPONSE');
            return 'No problem. ' + START_PROMPT;
        }
        if (result.kind === 'future') return futureReply;
        if (result.kind === 'invalid') {
            return 'I could not read that date. Please type it as year/month/day (for example 2025/12/25), or something like "3 weeks ago". If your baby hasn\'t been born yet, type "not yet", or type "skip".';
        }

        let days = result.days;
        let approximate = false;
        if (result.kind === 'bs') {
            const converted = bsToAd(result.year, result.month, result.day);
            if (!converted) {
                return 'I could not read that Nepali date. Please type it as year/month/day (for example 2082/09/10).';
            }
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const born = new Date(converted.getFullYear(), converted.getMonth(), converted.getDate());
            days = Math.round((today - born) / 86400000);
            approximate = true;
            if (days < 0) return futureReply;
        }

        localStorage.setItem('isLessThanTwoWeeks', String(days < 14));
        setState('BIRTH_TIMING_RESPONSE');
        return 'Thank you for sharing. ' + birthTimingMessage(days, { approximate }) + '\n\n' + START_PROMPT;
    }

    function handleInfoTopics(message) {
        if (/^(menu|exit|back)$/i.test(message)) {
            setState('USER_LED');
            return replyFor('menu', replyLanguage(message));
        }
        const choice = message.match(/^([1-5])[.)]?$/);
        if (choice) {
            const prompt = PPD_TOPICS_PROMPT.replace('What would you like to know:', 'What else would you like to know:');
            const encouragement = infoMode === 'pregnant' ? '\n\n' + PREGNANCY_ENCOURAGEMENT : '';
            return PPD_INFO[choice[1]] + encouragement + '\n\n' + prompt;
        }
        return 'I can share information on these five topics. Please choose a number from 1 to 5.\n\n' + PPD_TOPICS_PROMPT;
    }

    function handleSymptoms(message) {
        if (/^(exit|back|menu)$/i.test(message)) {
            setState('USER_LED');
            return replyFor('menu', replyLanguage(message));
        }
        const choice = message.match(/^([1-5])[.)]?$/);
        if (choice) return SYMPTOM_AREAS[choice[1]];
        if (/^\d+$/.test(message)) return 'Please select a valid number between 1 and 5:\n\n' + SYMPTOM_MENU;
        return "I'm not sure which area you'd like to check. Please select a number (1-5).\n\n" + SYMPTOM_MENU;
    }

    // Open conversation. The assistant only answers what it has reviewed answers for;
    // anything else gets a polite "I can't help with that" and the menu.
    function handleFreeText(message) {
        const language = replyLanguage(message);
        const kind = classifyMessage(message);

        switch (kind) {
            case 'yes':
            case 'epds':
            case 'menu_1':
                setState('EPDS_LANGUAGE_SELECTION');
                return EPDS_LANGUAGE_PROMPT;
            case 'menu_2':
                infoMode = 'postpartum';
                setState('IN_PREGNANCY_INFO');
                return PPD_TOPICS_PROMPT;
            case 'menu_3':
            case 'symptoms':
                setState('SYMPTOMS_QUESTIONNAIRE');
                return SYMPTOM_MENU;
            case 'menu_4':
            case 'info_selfcare':
                return PPD_INFO[5] + INFO_FOOTER;
            case 'info_what':
                return PPD_INFO[1] + INFO_FOOTER;
            case 'info_causes':
                return PPD_INFO[2] + INFO_FOOTER;
            case 'info_symptoms':
                return PPD_INFO[3] + INFO_FOOTER;
            case 'info_prevention':
                return PPD_INFO[4] + INFO_FOOTER;
            default:
                return replyFor(kind, language) || replyFor('offtopic', language);
        }
    }

    // Decide the reply to one (already cleaned) user message and move the conversation on
    function respondTo(message) {
        // Safety comes first, in every step
        if (detectCrisis(message)) {
            const language = conversationState === 'EPDS_START' ? epdsLanguage() : replyLanguage(message);
            let reply = crisisMessage(language);
            if (conversationState === 'EPDS_START') {
                reply += "\n\nWhenever you're ready, we can continue.\n\n" + formatEpdsQuestion(language, readEpdsAnswers().length);
            }
            return reply;
        }

        switch (conversationState) {
            case 'AWAITING_CONTINUE':
                if (isYes(message)) {
                    setState('AWAITING_AGE');
                    return AGE_PROMPT;
                }
                return "Please type 'continue' to begin. If you'd rather not chat right now, you can close this page at any time.";

            case 'AWAITING_AGE':
            case 'AGE_VERIFICATION_FAILED':
                return handleAge(message);

            case 'AWAITING_CHILD_BIRTHDATE':
                return handleBirthDate(message);

            case 'BIRTH_TIMING_RESPONSE':
                if (isYes(message)) {
                    setState('EPDS_LANGUAGE_SELECTION');
                    return EPDS_LANGUAGE_PROMPT;
                }
                if (isNo(message)) {
                    setState('USER_LED');
                    return wellnessAndHelplines();
                }
                return "Please answer Yes or No. Would you like to start a few short questions about how you've been feeling?";

            case 'EPDS_LANGUAGE_SELECTION':
                if (/^(1|english|अंग्रेजी)$/i.test(message)) return startEpds('english');
                if (/^(2|nepali|नेपाली)$/i.test(message)) return startEpds('nepali');
                if (/^menu$/i.test(message)) {
                    setState('USER_LED');
                    return replyFor('menu', 'english');
                }
                return "I didn't understand your selection. Please choose your preferred language for the questionnaire:\n\n1. English\n2. नेपाली (Nepali)";

            case 'EPDS_START':
                return handleEpdsAnswer(message);

            case 'IN_PREGNANCY_INFO':
                return handleInfoTopics(message);

            case 'SYMPTOMS_QUESTIONNAIRE':
                return handleSymptoms(message);

            default: // USER_LED
                return handleFreeText(message);
        }
    }

    // Tappable answers for what the assistant just asked: the numbered list in its message, plus
    // the single answers some steps expect ("continue", yes / no). Tapping sends what typing would.
    function repliesFor(text) {
        const send = (value, label) => ({ label, run: () => handleUserMessage(value, label) });
        const numbered = numberedOptions(text);

        if (conversationState === 'SYMPTOMS_QUESTIONNAIRE') {
            // The reply to one area ends with "enter a number 1-5" and no list, so offer the areas again
            const areas = numbered.length ? numbered : numberedOptions(SYMPTOM_MENU);
            return [...areas.map((option) => send(String(option.number), option.label)), send('exit', 'Back to menu')];
        }
        if (numbered.length) {
            const options = numbered.map((option) => send(String(option.number), option.label));
            if (conversationState === 'IN_PREGNANCY_INFO') options.push(send('menu', 'Back to menu'));
            return options;
        }
        if (conversationState === 'AWAITING_CONTINUE') return [send('continue', 'Continue')];
        if (conversationState === 'BIRTH_TIMING_RESPONSE') return [send('yes', 'Yes'), send('no', 'No')];
        return [];
    }

    // Does this message go to the AI? Only conversation does. Everything with a reviewed answer or
    // a safety reply keeps its fixed reply, and a crisis message is never given to the AI at all.
    const GUIDED_STATES = ['BIRTH_TIMING_RESPONSE', 'IN_PREGNANCY_INFO', 'SYMPTOMS_QUESTIONNAIRE'];

    function shouldAskAssistant(message) {
        if (!assistantOn || Date.now() < assistantPausedUntil) return false;
        if (detectCrisis(message)) return false;
        const kind = classifyMessage(message);
        if (conversationState === 'USER_LED') return wantsAssistant(kind, { afterAssistant: lastReplyFromAssistant });
        if (GUIDED_STATES.includes(conversationState)) {
            // These steps keep their own answers (yes / no, a number, menu). Anything else is conversation.
            if (/^(menu|exit|back|new|[1-5][.)]?)$/i.test(message) || isYes(message) || isNo(message)) return false;
            return wantsAssistant(kind);
        }
        return false;
    }

    // The AI's reply to the conversation so far (the newest message is already in the transcript),
    // or null when it cannot answer, and the caller uses the fixed reply instead.
    async function askAssistant() {
        try {
            const response = await window.MOMAuth.apiFetch('/api/v1/assistant/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: transcript.slice(-16).map((entry) => ({ role: entry.role, text: entry.text.slice(0, 3000) })) }),
                timeoutMs: 30000
            });
            if (response.ok) {
                const { data } = await response.json();
                if (data && data.reply) return data.reply;
            }
        } catch (error) {
            // fall through to the pause below
        }
        assistantPausedUntil = Date.now() + 60000;
        return null;
    }

    // Process user message
    async function processUserMessage(rawMessage) {
        const userMessage = normalizeText(rawMessage);
        if (!userMessage || isProcessing) return;

        isProcessing = true;
        const loadingMessage = addMessage('', false, true);
        try {
            let response = shouldAskAssistant(userMessage) ? await askAssistant() : null;
            const fromAssistant = response !== null;
            if (!fromAssistant) {
                // Short pause so the reply feels like someone typing
                await new Promise((resolve) => setTimeout(resolve, 800));
                response = respondTo(userMessage);
            }
            lastReplyFromAssistant = fromAssistant;
            loadingMessage.remove();
            // The AI's words are shown as plain text only
            if (response) addMessage(response, false, false, fromAssistant ? { plain: true } : { actions: repliesFor(response) });
        } catch (error) {
            console.error('Chat error:', error);
            loadingMessage.remove();
            // Say plainly that something broke, and offer to run the same message again
            const failed = addMessage("I'm sorry, something went wrong on my side. Please try again, or type 'new' to start over.", false, false, {
                isError: true,
                actions: [{ label: 'Try again', run: () => { failed.remove(); processUserMessage(rawMessage); } }]
            });
        } finally {
            isProcessing = false;
        }
    }

    // Single optimized handler for all input methods
    function handleUserInput(e) {
        // Prevent default for any event type
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        
        // Don't process if already handling a message
        if (isProcessing) {
            console.log("⚠️ Already processing a message, ignoring input");
            return;
        }
        
        // Use the handleUserMessage function which checks for "new" command
        handleUserMessage();
    }
    
    // Apply the handler to all input methods
    chatForm.addEventListener('submit', handleUserInput);
    sendButton.addEventListener('click', handleUserInput);
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            handleUserInput(e);
        }
    });
    
    // Set the processUserMessage function in the debug object
    window.debugChatbot.processUserMessage = processUserMessage;
    
    // Initialize chat with greeting
    initializeChat();

    // Function to handle user messages. A tapped answer passes what to send (for example "1")
    // and what to show in the chat (for example "Yes").
    function handleUserMessage(override, shown) {
        const fromButton = override !== undefined;
        // Keep one message to a sensible length
        const userMessage = (fromButton ? override : messageInput.value).trim().slice(0, 500);
        if (!userMessage) return;

        // Starting over also starts a new saved chat
        if (isNewCommand(userMessage)) {
            recorder.startNew();
            transcript = [];
            lastReplyFromAssistant = false;
        }

        // Display user message (a tapped answer shows its words, not the number it stands for)
        addMessage(shown || userMessage, true);
        if (!fromButton) messageInput.value = '';

        // Check if user wants to start a new conversation
        if (isNewCommand(userMessage)) {
            console.log("User requested a new conversation");
            ['userAge', 'userBirthTiming', 'userEmotionalState', 'userMentalState', 'userSleepPattern', 'userPhysicalCondition', 'userSymptoms']
                .forEach((key) => localStorage.removeItem(key));
            infoMode = 'postpartum';
            // The next message is read as the age
            setState('AWAITING_AGE');

            setTimeout(() => {
                addMessage("Hi, I'm Sutkeri, your postpartum support companion. To give you the best support, may I ask your age?", false);
            }, 1000);
            return;
        }

        // Process message based on current state
        processUserMessage(userMessage);
    }

    // Helper: Convert Nepali (Bikram Sambat) date to Gregorian (AD)
    function bsToAd(bsYear, bsMonth, bsDay) {
        // Improved approximation for Bikram Sambat to Gregorian conversion
        // BS is generally 56-57 years ahead of AD depending on the month
        
        // Convert BS date to AD
        let adYear, adMonth, adDay;
        
        // Handle basic conversion - more accurate algorithm
        if (bsYear < 2000) {
            console.error("Invalid BS year: Must be 2000 or later");
            return null;
        }
        
        // Handle basic conversion - different offsets for different years
        // For years 2070-2099
        if (bsYear >= 2070 && bsYear < 2100) {
            adYear = bsYear - 57;  // More accurate for recent years
        } 
        // For years 2000-2069
        else if (bsYear >= 2000 && bsYear < 2070) {
            adYear = bsYear - 56;  // Different offset for earlier years
        } 
        else {
            adYear = bsYear - 57;  // Default offset
        }
        
        // Adjust for month differences (BS new year starts around mid-April)
        if (bsMonth < 9) {  // First 8 months of BS year (Baisakh to Mangshir)
            adMonth = bsMonth + 3;
            // No year adjustment needed
        } else {  // Last 4 months of BS year (Poush to Chaitra)
            adMonth = bsMonth - 9;
            adYear += 1;  // These correspond to next AD year
        }
        
        // Keep the day roughly the same, but make adjustments for month-end cases
        adDay = bsDay;
        
        // Boundary adjustments
        if (adMonth === 0) {
            adMonth = 12;
            adYear -= 1;
        }
        
        // Adjust days for months with fewer than 31 days
        if (adDay > 28) {
            // February special case
            if (adMonth === 2) {
                const isLeapYear = (adYear % 4 === 0 && adYear % 100 !== 0) || (adYear % 400 === 0);
                adDay = Math.min(adDay, isLeapYear ? 29 : 28);
            }
            // 30-day months
            else if ([4, 6, 9, 11].includes(adMonth)) {
                adDay = Math.min(adDay, 30);
            }
        }
        
        console.log(`Converting BS ${bsYear}-${bsMonth}-${bsDay} to AD ${adYear}-${adMonth}-${adDay}`);
        
        // Additional debug information
        if (window.chatbotDebugMode) {
            console.log(`Conversion details:
            - Input BS date: ${bsYear}/${bsMonth}/${bsDay}
            - Calculated AD date: ${adYear}/${adMonth}/${adDay}
            - Adjustment logic:
              * Year offset: ${bsYear - adYear} years
              * Month mapping: BS month ${bsMonth} → AD month ${adMonth}
              * Day adjustment: ${bsDay === adDay ? 'None' : `${bsDay} → ${adDay}`}`);
        }
        
        // Create and return JS Date object (with local timezone)
        return new Date(adYear, adMonth - 1, adDay);
    }
}); 