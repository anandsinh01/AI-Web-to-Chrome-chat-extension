document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const questionInput = document.getElementById('question-input');
    const sendButton = document.getElementById('send-button');
    const loadingIndicator = document.getElementById('loading');

    // Function to add a message to the chat
    function addMessage(text, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
        messageDiv.textContent = text;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Function to get page content
    async function getPageContent() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }

            // Ensure content script is injected
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            return new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tab.id, { action: 'getPageContent' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error getting page content:', chrome.runtime.lastError);
                        reject(new Error('Could not get page content. Please try refreshing the page.'));
                        return;
                    }
                    if (!response) {
                        reject(new Error('No response from content script. Please try refreshing the page.'));
                        return;
                    }
                    resolve(response);
                });
            });
        } catch (error) {
            console.error('Error in getPageContent:', error);
            throw error;
        }
    }

    // Function to process question with Gemini AI
    async function processQuestion(question) {
        loadingIndicator.style.display = 'block';
        
        try {
            // Get the current page content
            const pageContent = await getPageContent();
            
            // Get the API key from storage
            const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);
            
            if (!geminiApiKey) {
                addMessage("Please set your Gemini API key in the extension settings first. Right-click the extension icon and select 'Options' to add your API key.");
                loadingIndicator.style.display = 'none';
                return;
            }

            // Prepare the prompt for Gemini
            const prompt = `Context from webpage:
Title: ${pageContent.title}
Description: ${pageContent.metaDescription}
Content: ${pageContent.content}

Question: ${question}

Please provide a helpful answer based on the webpage content.`;

            // Call Gemini API
            const response = await callGeminiAPI(geminiApiKey, prompt);
            addMessage(response);
        } catch (error) {
            console.error('Error details:', error);
            let errorMessage = "Sorry, I encountered an error while processing your question. ";
            
            if (error.message.includes('API key')) {
                errorMessage += "Please check if your Gemini API key is correct in the extension settings.";
            } else if (error.message.includes('network')) {
                errorMessage += "Please check your internet connection.";
            } else if (error.message.includes('page content')) {
                errorMessage += "Please try refreshing the page and try again.";
            } else {
                errorMessage += "Please try again later.";
            }
            
            addMessage(errorMessage);
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    // Function to call Gemini API
    async function callGeminiAPI(apiKey, prompt) {
        const url = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent';
        
        try {
            const response = await fetch(`${url}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024,
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('API Error Response:', errorData);
                
                // Check if it's an API key error
                if (errorData.error?.message?.includes('API key')) {
                    throw new Error('Invalid API key. Please check your Gemini API key in the extension settings.');
                }
                
                throw new Error(`API request failed: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
                throw new Error('Invalid response format from Gemini API');
            }

            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error('API Call Error:', error);
            throw error;
        }
    }

    // Handle send button click
    sendButton.addEventListener('click', async () => {
        const question = questionInput.value.trim();
        if (question) {
            addMessage(question, true);
            questionInput.value = '';
            await processQuestion(question);
        }
    });

    // Handle enter key in input
    questionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendButton.click();
        }
    });
}); 