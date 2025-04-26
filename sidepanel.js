document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const questionInput = document.getElementById('question-input');
    const sendButton = document.getElementById('send-button');
    const loadingIndicator = document.getElementById('loading');
    const attachmentButton = document.getElementById('attachment-button');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    let attachedFiles = [];

    // Function to format text with markdown-style headings
    function formatText(text) {
        // Convert markdown-style headings to HTML
        text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');
        text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        
        // Convert bullet points to list items
        text = text.replace(/^\s*[-*] (.*$)/gm, '<li>$1</li>');
        
        // Convert numbered lists
        text = text.replace(/^\s*\d+\. (.*$)/gm, '<li>$1</li>');
        
        // Wrap lists in ul tags
        text = text.replace(/(<li>.*<\/li>\n)+/g, '<ul>$&</ul>');
        
        // Convert bold and italic
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Convert code blocks
        text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // Convert inline code
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Convert links
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // Convert line breaks
        text = text.replace(/\n/g, '<br>');
        
        return text;
    }

    // Function to save chat history
    async function saveChatHistory(messages) {
        try {
            await chrome.storage.local.set({ chatHistory: messages });
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
    }

    // Function to load chat history
    async function loadChatHistory() {
        try {
            const result = await chrome.storage.local.get(['chatHistory']);
            return result.chatHistory || [];
        } catch (error) {
            console.error('Error loading chat history:', error);
            return [];
        }
    }

    // Function to clear chat history
    async function clearChatHistory() {
        try {
            await chrome.storage.local.remove(['chatHistory']);
            chatMessages.innerHTML = '';
            addMessage("Hello! I'm your WebChat AI assistant. I can help you understand the content of this webpage. What would you like to know?", false);
        } catch (error) {
            console.error('Error clearing chat history:', error);
        }
    }

    // Function to add a message to the chat
    async function addMessage(text, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
        
        if (isUser) {
            messageDiv.textContent = text;
        } else {
            messageDiv.innerHTML = formatText(text);
        }
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Save the message to history
        const messages = await loadChatHistory();
        messages.push({
            text,
            isUser,
            timestamp: new Date().toISOString()
        });
        await saveChatHistory(messages);
    }

    // Function to display chat history
    async function displayChatHistory() {
        const messages = await loadChatHistory();
        chatMessages.innerHTML = '';
        
        if (messages.length === 0) {
            addMessage("Hello! I'm your WebChat AI assistant. I can help you understand the content of this webpage. What would you like to know?", false);
            return;
        }

        for (const message of messages) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${message.isUser ? 'user-message' : 'ai-message'}`;
            
            if (message.isUser) {
                messageDiv.textContent = message.text;
            } else {
                messageDiv.innerHTML = formatText(message.text);
            }
            
            chatMessages.appendChild(messageDiv);
        }
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Add clear history button
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear History';
    clearButton.style.cssText = `
        padding: 5px 10px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-left: 10px;
    `;
    clearButton.addEventListener('click', clearChatHistory);
    document.querySelector('.header').appendChild(clearButton);

    // Load chat history when the page loads
    displayChatHistory();

    // Function to get page content
    async function getPageContent() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }

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

    // Function to handle file attachments
    function handleFileAttachments(files) {
        attachedFiles = Array.from(files);
        if (attachedFiles.length > 0) {
            const fileNames = attachedFiles.map(file => file.name).join(', ');
            addMessage(`Attached files: ${fileNames}`, true);
        }
    }

    // Add event listeners for file handling
    attachmentButton.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        handleFileAttachments(e.target.files);
    });

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
            let prompt = `Context from webpage:
Title: ${pageContent.title}
Description: ${pageContent.metaDescription}
Content: ${pageContent.content}

Question: ${question}`;

            // Add file content to prompt if files are attached
            if (attachedFiles.length > 0) {
                prompt += "\n\nAttached files:";
                for (const file of attachedFiles) {
                    const fileContent = await readFileContent(file);
                    prompt += `\n\nFile: ${file.name}\nContent: ${fileContent}`;
                }
            }

            prompt += "\n\nPlease provide a helpful answer based on the webpage content and any attached files. Format your response with:\n1. A clear heading (use # for main heading)\n2. Subheadings where appropriate (use ## or ###)\n3. Bullet points for lists (use - or *)\n4. Bold text for important points (use **)\n5. Code blocks for technical content (use \`\`\`)\n6. Links where relevant (use [text](url))\n\nMake the response well-structured and easy to read.";

            // Call Gemini API
            const response = await callGeminiAPI(geminiApiKey, prompt);
            addMessage(response);
            
            // Clear attached files after processing
            attachedFiles = [];
            fileInput.value = '';
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

    // Function to read file content
    function readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
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
            await addMessage(question, true);
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

    // Function to export chat history in different formats
    async function exportChatHistory(format = 'json') {
        try {
            const messages = await loadChatHistory();
            const exportData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                messages: messages
            };

            let blob;
            let filename;
            let mimeType;

            switch (format) {
                case 'json':
                    blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                    filename = `webchat-history-${new Date().toISOString().split('T')[0]}.json`;
                    mimeType = 'application/json';
                    break;

                case 'txt':
                    blob = await DocumentGenerator.generateTextDocument(messages);
                    filename = `webchat-history-${new Date().toISOString().split('T')[0]}.txt`;
                    mimeType = 'text/plain';
                    break;

                case 'html':
                    blob = await DocumentGenerator.generatePDFDocument(messages);
                    filename = `webchat-history-${new Date().toISOString().split('T')[0]}.html`;
                    mimeType = 'text/html';
                    break;
            }

            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting chat history:', error);
            alert('Failed to export chat history. Please try again.');
        }
    }

    // Add export format buttons to header
    const exportMenu = document.createElement('div');
    exportMenu.style.cssText = `
        position: relative;
        display: inline-block;
        margin-left: 10px;
    `;

    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export History';
    exportButton.style.cssText = `
        padding: 5px 10px;
        background: #28a745;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;

    const exportDropdown = document.createElement('div');
    exportDropdown.style.cssText = `
        display: none;
        position: absolute;
        background-color: white;
        min-width: 160px;
        box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
        z-index: 1;
        border-radius: 4px;
    `;

    const formats = [
        { name: 'JSON', value: 'json' },
        { name: 'Text File', value: 'txt' },
        { name: 'HTML', value: 'html' }
    ];

    formats.forEach(format => {
        const option = document.createElement('a');
        option.textContent = format.name;
        option.style.cssText = `
            color: black;
            padding: 12px 16px;
            text-decoration: none;
            display: block;
            cursor: pointer;
        `;
        option.addEventListener('mouseover', () => {
            option.style.backgroundColor = '#f1f1f1';
        });
        option.addEventListener('mouseout', () => {
            option.style.backgroundColor = 'white';
        });
        option.addEventListener('click', () => {
            exportChatHistory(format.value);
            exportDropdown.style.display = 'none';
        });
        exportDropdown.appendChild(option);
    });

    exportButton.addEventListener('click', () => {
        exportDropdown.style.display = exportDropdown.style.display === 'none' ? 'block' : 'none';
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        if (!exportMenu.contains(event.target)) {
            exportDropdown.style.display = 'none';
        }
    });

    exportMenu.appendChild(exportButton);
    exportMenu.appendChild(exportDropdown);

    // Add buttons to header
    const header = document.querySelector('.header');
    header.appendChild(exportMenu);
}); 