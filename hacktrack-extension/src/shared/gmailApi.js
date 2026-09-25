/**
 * HackTrack - Gmail REST API Client
 * Interfaces with Google OAuth 2.0 via chrome.identity and Gmail v1 API.
 */

const GMAIL_BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Obtain an OAuth 2.0 token using chrome.identity.getAuthToken
 * @param {boolean} interactive - Whether to prompt the user if not already signed in
 * @returns {Promise<string>} - The OAuth access token
 */
export async function getAuthToken(interactive = false) {
  if (typeof chrome === 'undefined' || !chrome.identity || !chrome.identity.getAuthToken) {
    throw new Error('chrome.identity API is not available in this environment.');
  }

  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!token) {
        reject(new Error('No OAuth token returned.'));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Remove/invalidate a cached auth token
 * @param {string} token
 */
export async function removeCachedAuthToken(token) {
  if (typeof chrome === 'undefined' || !chrome.identity || !chrome.identity.removeCachedAuthToken) {
    return;
  }

  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      resolve();
    });
  });
}

/**
 * Safely decode base64 / base64url string with UTF-8 support
 * @param {string} base64UrlStr
 * @returns {string}
 */
export function decodeBase64Url(base64UrlStr) {
  if (!base64UrlStr) return '';
  try {
    // Replace URL-safe characters with base64 standard characters
    let base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
    // Pad with '=' so string length is a multiple of 4
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    
    // Decode base64 to binary string
    const binaryString = atob(base64);
    // Convert binary string to UTF-8 decoded text
    const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  } catch (err) {
    console.warn('[GmailAPI] Failed to decode base64 content:', err);
    return '';
  }
}

/**
 * Convert HTML content to clean, readable plain text
 * @param {string} html
 * @returns {string}
 */
export function convertHtmlToPlainText(html) {
  if (!html) return '';

  let text = html;
  // Remove script and style elements with content
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Replace <br>, <p>, <div>, <tr> with newlines
  text = text.replace(/<br\s*[\/]?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&copy;/gi, '©');

  // Collapse multiple whitespaces and consecutive blank lines
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  return text.trim();
}

/**
 * Recursively extract plain text and HTML from a Gmail message payload
 * @param {object} payload - Gmail message payload object
 * @returns {string} - Combined readable body text
 */
export function extractMessageContent(payload) {
  if (!payload) return '';

  // 1. Direct body data
  if (payload.body && payload.body.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/html') {
      return convertHtmlToPlainText(decoded);
    }
    return decoded;
  }

  // 2. Multipart messages
  if (payload.parts && Array.isArray(payload.parts)) {
    let plainTextPart = '';
    let htmlPart = '';

    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        plainTextPart = decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
        htmlPart = convertHtmlToPlainText(decodeBase64Url(part.body.data));
      } else if (part.parts) {
        // Recursive handling for nested multiparts
        const nestedContent = extractMessageContent(part);
        if (nestedContent) {
          return nestedContent;
        }
      }
    }

    // Prefer plain text if available; otherwise use sanitized HTML
    if (plainTextPart.trim()) {
      return plainTextPart.trim();
    }
    if (htmlPart.trim()) {
      return htmlPart.trim();
    }
  }

  return '';
}

/**
 * Search Gmail messages matching a query
 * @param {string} query - Gmail search query
 * @param {number} maxResults - Max number of results to fetch (default: 10)
 * @param {string} token - OAuth access token
 * @returns {Promise<Array<{ id: string, threadId: string }>>}
 */
export async function searchGmail(query, maxResults = 10, token) {
  if (!token) throw new Error('Authentication token is required to search Gmail.');

  const searchUrl = `${GMAIL_BASE_URL}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const response = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      await removeCachedAuthToken(token);
      throw new Error('GMAIL_AUTH_EXPIRED');
    }
    const errorBody = await response.text();
    throw new Error(`Gmail search failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.messages || [];
}

/**
 * Fetch full details of a single Gmail message by ID
 * @param {string} messageId - The Gmail message ID
 * @param {string} token - OAuth access token
 * @returns {Promise<object>}
 */
export async function fetchMessageDetails(messageId, token) {
  if (!token) throw new Error('Authentication token is required.');

  const messageUrl = `${GMAIL_BASE_URL}/messages/${messageId}?format=full`;
  const response = await fetch(messageUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      await removeCachedAuthToken(token);
      throw new Error('GMAIL_AUTH_EXPIRED');
    }
    throw new Error(`Failed to fetch message ${messageId}: ${response.status}`);
  }

  const messageData = await response.json();
  const headers = messageData.payload?.headers || [];

  const getHeader = (name) => {
    const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
    return found ? found.value : '';
  };

  const bodyContent = extractMessageContent(messageData.payload);

  return {
    id: messageData.id,
    threadId: messageData.threadId,
    sender: getHeader('From'),
    recipient: getHeader('To'),
    subject: getHeader('Subject') || '(No Subject)',
    date: getHeader('Date'),
    snippet: messageData.snippet || '',
    body: bodyContent || messageData.snippet || '',
  };
}

/**
 * Fetch and extract all relevant emails for a given topic
 * @param {string} topicName - The opportunity or topic name to search for
 * @param {string} token - OAuth access token
 * @param {number} maxResults - Max emails to process (default: 10)
 * @returns {Promise<Array<object>>} - List of clean email objects
 */
export async function fetchEmailsForTopic(topicName, token, maxResults = 10) {
  if (!topicName || !topicName.trim()) {
    return [];
  }

  // Construct search query
  const trimmed = topicName.trim();
  const query = `"${trimmed}" OR ${trimmed}`;

  try {
    const messages = await searchGmail(query, maxResults, token);

    if (!messages || messages.length === 0) {
      return [];
    }

    // Fetch details for up to maxResults messages concurrently
    const emailPromises = messages.slice(0, maxResults).map(async (msg) => {
      try {
        return await fetchMessageDetails(msg.id, token);
      } catch (err) {
        console.warn(`[GmailAPI] Skipping message ${msg.id} due to fetch error:`, err);
        return null;
      }
    });

    const results = await Promise.all(emailPromises);
    return results.filter((email) => email !== null && (email.body || email.snippet));
  } catch (err) {
    console.error(`[GmailAPI] Error fetching emails for topic "${topicName}":`, err);
    throw err;
  }
}
