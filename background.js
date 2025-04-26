// Background script for handling extension lifecycle and global state
chrome.runtime.onInstalled.addListener(() => {
    console.log('WebChat AI extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle any background-level messages here
    return true;
}); 