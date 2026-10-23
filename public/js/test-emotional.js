// Test script for emotional state processing
document.addEventListener('DOMContentLoaded', function() {
    // Set up test environment
    console.log("🧪 Emotional State Test Harness Loaded");
    
    // This is a standalone test version of the emotional state processing logic
    function testEmotionalInput(userMessage) {
        console.group("🧪 Testing input: " + JSON.stringify(userMessage));
        console.log("📊 Type:", typeof userMessage);
        console.log("📏 Length:", userMessage.length);
        console.log("🔡 Character codes:", Array.from(userMessage).map(c => c.charCodeAt(0)).join(", "));
        
        let emotionalInputProcessed = false;
        let recognitionMethod = "";
        
        // METHOD 1: Direct string match
        if (userMessage === "1" || userMessage === "2" || userMessage === "3" || 
            userMessage === "4" || userMessage === "5" || userMessage === "6") {
            recognitionMethod = "Direct string match";
            emotionalInputProcessed = true;
            console.log("✅ METHOD 1: Direct string match: " + userMessage);
        }
        // METHOD 2: Trimmed string match
        else if (userMessage.trim() === "1" || userMessage.trim() === "2" || 
                 userMessage.trim() === "3" || userMessage.trim() === "4" || 
                 userMessage.trim() === "5" || userMessage.trim() === "6") {
            recognitionMethod = "Trimmed string match";
            emotionalInputProcessed = true;
            console.log("✅ METHOD 2: Trimmed string match: " + userMessage.trim());
        }
        // METHOD 3: First digit extraction
        else if (!emotionalInputProcessed) {
            const firstDigitMatch = userMessage.match(/[1-6]/);
            if (firstDigitMatch) {
                recognitionMethod = "First digit extraction: " + firstDigitMatch[0];
                emotionalInputProcessed = true;
                console.log("✅ METHOD 3: First digit extraction: " + firstDigitMatch[0]);
            }
        }
        // METHOD 4: Try parseInt
        else if (!emotionalInputProcessed) {
            try {
                const numValue = parseInt(userMessage);
                if (!isNaN(numValue) && numValue >= 1 && numValue <= 6) {
                    recognitionMethod = "parseInt successful: " + numValue;
                    emotionalInputProcessed = true;
                    console.log("✅ METHOD 4: parseInt successful: " + numValue);
                }
            } catch (e) {
                console.log("❌ parseInt error:", e);
            }
        }
        
        // METHOD 5: Text pattern matching
        if (!emotionalInputProcessed) {
            if (/\bsad\b|\btearful\b|😞|tear|cry|depressed/i.test(userMessage)) {
                recognitionMethod = "Text pattern (sad/tearful)";
                emotionalInputProcessed = true;
                console.log("✅ METHOD 5: Recognized sad/tearful");
            }
            else if (/\banxious\b|\bworried\b|😰|worry|worr|nervous|panic/i.test(userMessage)) {
                recognitionMethod = "Text pattern (anxious/worried)";
                emotionalInputProcessed = true;
                console.log("✅ METHOD 5: Recognized anxious/worried");
            }
            else if (/\bokay\b|\bmostly okay\b|🙂|good|fine|alright/i.test(userMessage)) {
                recognitionMethod = "Text pattern (mostly okay)";
                emotionalInputProcessed = true;
                console.log("✅ METHOD 5: Recognized mostly okay");
            }
            else if (/\bnumb\b|\bempty\b|😐|nothing|don't feel|don't care|disconnected/i.test(userMessage)) {
                recognitionMethod = "Text pattern (numb/empty)";
                emotionalInputProcessed = true;
                console.log("✅ METHOD 5: Recognized numb/empty");
            }
            else if (/\birritable\b|\bangry\b|😡|frustrated|upset|mad/i.test(userMessage)) {
                recognitionMethod = "Text pattern (irritable/angry)";
                emotionalInputProcessed = true;
                console.log("✅ METHOD 5: Recognized irritable/angry");
            }
            else if (/\bhappy\b|\bexcited\b|❤️|joy|great|wonderful/i.test(userMessage)) {
                recognitionMethod = "Text pattern (happy/excited)";
                emotionalInputProcessed = true;
                console.log("✅ METHOD 5: Recognized happy/excited");
            }
            else {
                recognitionMethod = "DEFAULT: No specific emotion recognized";
                console.log("⚠️ No specific emotion recognized - defaulting");
            }
        }
        
        console.log("🏁 Final result:", emotionalInputProcessed ? "RECOGNIZED" : "NOT RECOGNIZED");
        console.log("🔍 Recognition method:", recognitionMethod);
        console.groupEnd();
        
        return {
            success: emotionalInputProcessed,
            method: recognitionMethod
        };
    }
    
    // Set up the test interface
    const runButton = document.getElementById('run-test-button');
    const testInput = document.getElementById('test-input');
    const resultDisplay = document.getElementById('test-result');
    
    if (runButton && testInput && resultDisplay) {
        runButton.addEventListener('click', function() {
            const input = testInput.value;
            const result = testEmotionalInput(input);
            
            // Display the result
            resultDisplay.className = result.success ? 'success' : 'failure';
            resultDisplay.innerHTML = `
                <h3>${result.success ? '✅ SUCCESS' : '❌ FAILURE'}</h3>
                <p><strong>Input:</strong> "${input}"</p>
                <p><strong>Method:</strong> ${result.method}</p>
            `;
        });
        
        // Add predefined test buttons
        const testCases = document.getElementById('test-cases');
        if (testCases) {
            const tests = [
                "1", "2", "3", "4", "5", "6",
                " 1 ", " 2 ", "1.", "2.",
                "I feel sad", "I'm anxious", "Feeling okay",
                "1) I feel sad", "2) I'm anxious", "3) Feeling okay"
            ];
            
            tests.forEach(test => {
                const button = document.createElement('button');
                button.className = 'test-button';
                button.textContent = test;
                button.addEventListener('click', function() {
                    testInput.value = test;
                    runButton.click();
                });
                testCases.appendChild(button);
            });
        }
    }
}); 