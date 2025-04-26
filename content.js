// Function to extract relevant text content from the page
function extractPageContent() {
    try {
        // Create a clone of the document to avoid modifying the original
        const clone = document.cloneNode(true);
        
        // Remove script and style elements
        const elementsToRemove = clone.querySelectorAll('script, style, iframe, noscript, link, meta[property="og:image"], meta[property="twitter:image"]');
        elementsToRemove.forEach(el => el.remove());

        // Get the main content
        const bodyText = clone.body.innerText;
        const title = clone.title;
        const metaDescription = clone.querySelector('meta[name="description"]')?.content || '';
        
        // Clean up the text
        const cleanedText = bodyText
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 10000); // Limit content length

        return {
            title,
            metaDescription,
            content: cleanedText
        };
    } catch (error) {
        console.error('Error extracting page content:', error);
        return {
            title: document.title,
            metaDescription: '',
            content: document.body.innerText.substring(0, 10000)
        };
    }
}

// Initialize content script
console.log('WebChat AI content script loaded');

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in content script:', request);
    
    if (request.action === 'getPageContent') {
        try {
            console.log('Extracting page content...');
            const content = extractPageContent();
            console.log('Page content extracted successfully');
            sendResponse(content);
        } catch (error) {
            console.error('Error in content script:', error);
            sendResponse({
                title: document.title,
                metaDescription: '',
                content: document.body.innerText.substring(0, 10000)
            });
        }
    }
    return true; // Keep the message channel open for async response
}); 