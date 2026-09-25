/**
 * HackTrack - Gemini AI Analysis & Extraction Client
 * Analyzes Gmail email threads to extract actionable deadlines, tasks, reminders, and updates.
 * Automatically validates dates, filters out past events, and calculates priority.
 */

// Centralized model definition with verified active fallback list
export const GEMINI_MODEL = 'gemini-flash-lite-latest';
const FALLBACK_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];



const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Get the configured Gemini API key from the environment
 */
export function getGeminiApiKey() {
  return import.meta.env.VITE_GEMINI_API_KEY || '';
}

/**
 * Format an email Date header string into a clean readable date and time
 * Example: "Thu, 25 Sep 2026 14:30:00 GMT" -> "Sep 25, 2026, 2:30 PM"
 * @param {string} dateHeader
 * @returns {string}
 */
export function formatEmailReceivedDate(dateHeader) {
  if (!dateHeader) return '';
  try {
    const d = new Date(dateHeader);
    if (isNaN(d.getTime())) return dateHeader;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateHeader;
  }
}

/**
 * Parse an extracted date string into a Date object
 * @param {string} dateStr
 * @param {Date} referenceDate
 * @returns {Date|null}
 */
export function parseOpportunityDate(dateStr, referenceDate = new Date()) {

  if (!dateStr || typeof dateStr !== 'string') return null;
  const cleaned = dateStr.trim();

  // Try standard Date parse (handles YYYY-MM-DD, ISO, etc.)
  let parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    // If year is suspiciously missing or default 2001, set current reference year
    if (parsed.getFullYear() < 2000) {
      parsed.setFullYear(referenceDate.getFullYear());
    }
    return parsed;
  }

  // Regex for "Month Day" / "Month Day, Year" (e.g. "Sep 27", "September 26, 2026")
  const monthNames = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };

  const match = cleaned.match(/([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
  if (match) {
    const month = monthNames[match[1].toLowerCase()];
    const day = parseInt(match[2], 10);
    const year = match[3] ? parseInt(match[3], 10) : referenceDate.getFullYear();
    if (month !== undefined && !isNaN(day)) {
      return new Date(year, month, day, 23, 59, 59);
    }
  }

  return null;
}

/**
 * Calculate days remaining and priority strictly based on current date
 * Rules:
 *  - 0 to 2 days remaining -> EMERGENCY
 *  - 3 to 7 days remaining -> URGENT
 *  - > 7 days remaining   -> NORMAL
 *  - < 0 days (past)      -> isUpcoming = false
 * @param {Date|null} targetDate
 * @param {Date} now
 * @returns {{ daysRemaining: number|null, priority: 'emergency' | 'urgent' | 'normal', isUpcoming: boolean, formattedDate: string }}
 */
export function calculatePriorityAndDays(targetDate, now = new Date()) {
  if (!targetDate || isNaN(targetDate.getTime())) {
    return {
      daysRemaining: null,
      priority: 'normal',
      isUpcoming: true, // If no date is extracted but opportunity is active, keep as normal
      formattedDate: '',
    };
  }

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetMidnight = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  const diffMs = targetMidnight.getTime() - todayMidnight.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  // Past event check
  if (diffDays < 0) {
    return {
      daysRemaining: diffDays,
      priority: 'normal',
      isUpcoming: false,
      formattedDate: targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  }

  let priority = 'normal';
  if (diffDays <= 2) {
    priority = 'emergency'; // 0, 1, 2 days
  } else if (diffDays <= 7) {
    priority = 'urgent'; // 3 to 7 days
  } else {
    priority = 'normal'; // > 7 days
  }

  const formattedDate = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return {
    daysRemaining: diffDays,
    priority,
    isUpcoming: true,
    formattedDate,
  };
}

/**
 * Robust JSON extraction from Gemini raw text response
 * @param {string} rawText
 * @returns {object}
 */
export function parseGeminiJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response received from Gemini.');
  }

  let cleaned = rawText.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
    cleaned = cleaned.trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (initialErr) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const extractedJson = cleaned.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(extractedJson);
      } catch (nestedErr) {
        throw new Error(`Invalid JSON format from Gemini: ${nestedErr.message}`);
      }
    }

    throw new Error(`Failed to parse Gemini output as JSON: ${initialErr.message}`);
  }
}

/**
 * Helper to convert items to clean readable strings
 */
export function formatSectionItems(items) {
  if (!items || !Array.isArray(items)) return [];
  return items.map((item) => {
    if (typeof item === 'string') return item;
    const datePart = item.date ? ` (${item.date})` : '';
    const descPart = item.description && item.description !== item.title ? `: ${item.description}` : '';
    return `${item.title || 'Item'}${datePart}${descPart}`;
  });
}

/**
 * Analyze opportunity emails using Gemini with date validation & deduplication.
 * Returns structured items for a single topic.
 * @param {string} topicName - The name of the followed topic
 * @param {Array<object>} emails - List of cleaned email objects from Gmail
 * @returns {Promise<Array<object>>} - List of processed, deduplicated, upcoming opportunity items (max 30)
 */
export async function analyzeOpportunityEmails(topicName, emails) {
  const apiKey = getGeminiApiKey();
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('Gemini API key is not configured in .env');
  }

  if (!emails || emails.length === 0) {
    return [];
  }

  const todayStr = new Date().toISOString().split('T')[0];

  // Limit input to max 30 emails to prevent token overflow
  const emailSummaries = emails.slice(0, 30).map((email, idx) => {
    return `=== EMAIL ${idx + 1} [MessageID: ${email.id}] ===
Subject: ${email.subject}
From: ${email.sender}
Date Sent: ${email.date}
Snippet: ${email.snippet}
Body:
${email.body.substring(0, 2000)}
`;
  }).join('\n\n');

  const systemInstruction = `You are an expert AI assistant analyzing Gmail emails for the opportunity topic: "${topicName}".
Today's Date is: ${todayStr}.

Your task:
1. Extract ALL distinct upcoming opportunities, contests, challenges, hackathons, events, promotions, or deadlines mentioned in the emails.
2. CRITICAL SPLITTING RULE:
   - If a single email mentions MULTIPLE events or contests (for example, "Weekly Contest 521" AND "Biweekly Contest 192"), you MUST split them into SEPARATE individual objects in the "opportunities" array!
   - DO NOT combine them into one single item like "Weekly Contest 521 and Biweekly Contest 192".
   - Each individual contest/event gets its own title, targetDate, and details.
3. For each individual opportunity:
   - "title": Clean concise title of the specific event/contest/opportunity (e.g. "Weekly Contest 521", "Biweekly Contest 192", "LeetCode Daily Challenge", "Back to School Promotion").
   - "summary": A brief 1-line description of the event or status (e.g. "Contest registration open", "Solve problems to win LeetCoins", "Submission deadline approaching").
   - "targetDate": The exact or approximate upcoming date mentioned in the email (e.g. "YYYY-MM-DD", "Sep 27, 2026", "Oct 2, 2026"). If no future date is explicitly mentioned, use the email's sent date.
   - "sourceMessageId": The source Gmail message ID where this was found.
   - Actionable bullet points:
     - "deadlines": Array of objects { "title": "...", "date": "...", "description": "..." }
     - "tasks": Array of objects { "title": "...", "description": "..." }
     - "reminders": Array of objects { "title": "...", "date": "...", "description": "..." }
     - "updates": Array of objects { "title": "...", "description": "..." }
4. Deduplicate: If multiple emails mention the exact same event with the same title, keep the most recent details.

Required JSON Output Schema:
{
  "opportunities": [
    {
      "title": "Specific Individual Contest / Event Name",
      "summary": "Brief 1-line description",
      "targetDate": "YYYY-MM-DD or date string mentioned in email",
      "sourceMessageId": "Gmail message ID",
      "deadlines": [
        { "title": "...", "date": "...", "description": "..." }
      ],
      "tasks": [
        { "title": "...", "description": "..." }
      ],
      "reminders": [
        { "title": "...", "date": "...", "description": "..." }
      ],
      "updates": [
        { "title": "...", "description": "..." }
      ]
    }
  ]
}`;


  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `${systemInstruction}\n\nHere are the emails to process:\n\n${emailSummaries}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  };

  let rawJson = null;

  for (const modelName of FALLBACK_MODELS) {
    try {
      const endpoint = `${GEMINI_API_BASE}/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawJson = parseGeminiJson(rawContent);
        break;
      }
    } catch (err) {
      console.warn(`[GeminiAPI] Model ${modelName} failed, trying fallback:`, err);
    }
  }

  if (!rawJson) {
    throw new Error('Failed to extract data with Gemini API.');
  }

  const rawOpportunities = Array.isArray(rawJson.opportunities)
    ? rawJson.opportunities
    : [];

  const now = new Date();
  const processedItems = [];
  const seenTitles = new Set();

  // Create email lookup map by ID
  const emailMap = new Map();
  for (const em of emails) {
    if (em.id) {
      emailMap.set(em.id, em);
    }
  }

  for (const opp of rawOpportunities) {
    const title = (opp.title || topicName).trim();
    const titleKey = title.toLowerCase();

    // Prevent duplicate items with identical names
    if (seenTitles.has(titleKey)) continue;

    // Parse target date and calculate priority
    const parsedDate = parseOpportunityDate(opp.targetDate, now);
    const { daysRemaining, priority, isUpcoming, formattedDate } = calculatePriorityAndDays(parsedDate, now);

    // Rule 3: Only show upcoming dates (ignore past opportunities)
    if (!isUpcoming) {
      console.log(`[GeminiAPI] Skipping past opportunity: "${title}" (${formattedDate})`);
      continue;
    }

    seenTitles.add(titleKey);

    const deadlines = formatSectionItems(opp.deadlines);
    const tasks = formatSectionItems(opp.tasks);
    const reminders = formatSectionItems(opp.reminders);
    const updates = formatSectionItems(opp.updates);

    // If no specific sections were extracted, add date as deadline
    if (deadlines.length === 0 && formattedDate) {
      const daysText =
        daysRemaining === 0
          ? 'Today'
          : daysRemaining === 1
          ? '1 day remaining'
          : `${daysRemaining} days remaining`;
      deadlines.push(`Deadline: ${formattedDate} (${daysText})`);
    }

    // Emergency star: 0 <= daysRemaining <= 2
    const isEmergency = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 2;

    // Look up email received date & time
    const matchedEmail = (opp.sourceMessageId && emailMap.get(opp.sourceMessageId)) || emails[0];
    const rawReceivedDate = matchedEmail?.date || '';
    const receivedDate = rawReceivedDate ? formatEmailReceivedDate(rawReceivedDate) : '';

    processedItems.push({
      id: `item-${opp.sourceMessageId || Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title,
      summary: opp.summary || '',
      sourceMessageId: opp.sourceMessageId || '',
      targetDate: parsedDate ? parsedDate.toISOString() : null,
      formattedDate: formattedDate || '',
      rawReceivedDate,
      receivedDate, // e.g. "Sep 25, 2026, 2:30 PM"
      daysRemaining: daysRemaining !== null ? daysRemaining : 999,
      isEmergency,
      priority, // 'emergency' | 'urgent' | 'normal'
      deadlines,
      tasks,
      reminders,
      updates,
    });
  }


  // Sort items: Nearest date first (daysRemaining ascending)
  processedItems.sort((a, b) => {
    const dA = typeof a.daysRemaining === 'number' ? a.daysRemaining : 999;
    const dB = typeof b.daysRemaining === 'number' ? b.daysRemaining : 999;
    return dA - dB;
  });

  // Cap at Maximum 30 Results
  const finalItems = processedItems.slice(0, 30);
  console.log(`[GeminiAPI] Returning ${finalItems.length} upcoming items for "${topicName}"`);

  return finalItems;
}

