/**
 * HackTrack - Background Service Worker
 * Handles Chrome side panel initialization, periodic sync alarms, OAuth management,
 * and Gmail + Gemini processing pipelines with date/priority calculation & deduplication.
 */

import { getAuthToken, removeCachedAuthToken, fetchEmailsForTopic } from '../shared/gmailApi.js';
import {
  analyzeOpportunityEmails,
  calculatePriorityAndDays,
  parseOpportunityDate,
} from '../shared/geminiApi.js';
import {
  getFollowedTopics,
  setFollowedTopics,
  removeFollowedTopic,
  getAuthStatus,
  setAuthStatus,
} from '../shared/storage.js';

const ALARM_NAME = 'refreshTopicsAlarm';
const SYNC_INTERVAL_MINUTES = 2;

/**
 * Initialize Side Panel Behavior
 */
async function setupSidePanel() {
  if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      console.log('[Background] Side panel configured to open on action click.');
    } catch (err) {
      console.warn('[Background] Failed to set side panel behavior:', err);
    }
  }
}

/**
 * Setup recurring sync alarm
 */
function setupSyncAlarm() {
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    chrome.alarms.get(ALARM_NAME, (existingAlarm) => {
      if (!existingAlarm) {
        chrome.alarms.create(ALARM_NAME, {
          delayInMinutes: 0.5,
          periodInMinutes: SYNC_INTERVAL_MINUTES,
        });
        console.log(`[Background] Registered periodic sync alarm every ${SYNC_INTERVAL_MINUTES} mins.`);
      }
    });
  }
}

// Extension Lifecycle Events
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] HackTrack extension installed/updated.');
  setupSidePanel();
  setupSyncAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Chrome started, initializing HackTrack.');
  setupSidePanel();
  setupSyncAlarm();
});

/**
 * Format current timestamp
 */
function formatCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Helper to compute overall topic priority from its items
 */
function computeTopicPriority(items) {
  if (!items || items.length === 0) return 'normal';
  if (items.some((it) => it.isEmergency || it.priority === 'emergency')) return 'emergency';
  if (items.some((it) => it.priority === 'urgent')) return 'urgent';
  return 'normal';
}

/**
 * Recalculate priority and days remaining for existing topics during periodic sync
 */
async function syncAndRecalculateTopics(token) {
  const existingTopics = await getFollowedTopics();
  if (!existingTopics || existingTopics.length === 0) return;

  const now = new Date();
  const updatedTopics = [];

  for (const topic of existingTopics) {
    const topicName = topic.name || topic.topicTag;
    try {
      const emails = await fetchEmailsForTopic(topicName, token, 30);
      if (emails && emails.length > 0) {
        const freshItems = await analyzeOpportunityEmails(topicName, emails);
        const priority = computeTopicPriority(freshItems);
        updatedTopics.push({
          ...topic,
          priority,
          items: freshItems,
          lastUpdated: formatCurrentTime(),
        });
      } else {
        // Recalculate existing items dates
        const recalculatedItems = (topic.items || [])
          .map((item) => {
            const targetDate = item.targetDate ? new Date(item.targetDate) : null;
            const { daysRemaining, priority, isUpcoming, formattedDate } = calculatePriorityAndDays(targetDate, now);
            if (!isUpcoming) return null; // filter out expired
            return {
              ...item,
              daysRemaining: daysRemaining !== null ? daysRemaining : item.daysRemaining,
              formattedDate: formattedDate || item.formattedDate,
              isEmergency: daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 2,
              priority,
            };
          })
          .filter(Boolean);

        updatedTopics.push({
          ...topic,
          items: recalculatedItems,
          priority: computeTopicPriority(recalculatedItems),
          lastUpdated: formatCurrentTime(),
        });
      }
    } catch (err) {
      console.warn(`[Background] Periodic sync failed for topic "${topicName}":`, err);
      updatedTopics.push(topic);
    }
  }

  // Sort topics: Pinned > Emergency > Urgent > Normal
  const priorityOrder = { emergency: 1, urgent: 2, normal: 3 };
  updatedTopics.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    const pA = priorityOrder[a.priority] || 3;
    const pB = priorityOrder[b.priority] || 3;
    return pA - pB;
  });

  await setFollowedTopics(updatedTopics);
  console.log(`[Background] Periodic sync completed for ${updatedTopics.length} topics.`);
}

/**
 * Scan all followed topics
 */
async function processAllTopics() {
  const isAuth = await getAuthStatus();
  if (!isAuth) {
    console.log('[Background] Skipping periodic sync: user is not authenticated.');
    return;
  }

  let token;
  try {
    token = await getAuthToken(false);
  } catch (err) {
    console.warn('[Background] Silent token retrieval failed during sync:', err.message);
    await setAuthStatus(false);
    return;
  }

  await syncAndRecalculateTopics(token);
}

/**
 * Listen for Chrome Alarms (2-minute periodic refresh)
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    processAllTopics();
  }
});

/**
 * Message Handler for communication with Side Panel
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  const handleMessage = async () => {
    switch (message.action) {
      case 'LOGIN': {
        try {
          const token = await getAuthToken(true);
          if (!token) {
            await setAuthStatus(false);
            return { success: false, error: 'Google login was cancelled or denied.' };
          }
          await setAuthStatus(true);
          processAllTopics();
          return { success: true, token };
        } catch (err) {
          console.error('[Background] Login failed:', err);
          await setAuthStatus(false);
          return { success: false, error: err.message || 'Google authentication failed.' };
        }
      }

      case 'LOGOUT': {
        try {
          try {
            const token = await getAuthToken(false);
            if (token) {
              await removeCachedAuthToken(token);
            }
          } catch {
            // Ignore token removal failure on logout
          }
          await setAuthStatus(false);
          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }

      case 'GET_LOGIN_STATUS': {
        try {
          const isStoredAuth = await getAuthStatus();
          if (!isStoredAuth) {
            return { isAuthenticated: false };
          }
          const token = await getAuthToken(false);
          const valid = !!token;
          if (!valid) {
            await setAuthStatus(false);
          }
          return { isAuthenticated: valid };
        } catch {
          await setAuthStatus(false);
          return { isAuthenticated: false };
        }
      }

      case 'FOLLOW_TOPIC': {
        let topicName = message.topicName?.trim() || '';
        topicName = topicName.replace(/^follow[:\s]+/i, '').trim();

        if (!topicName) {
          return { success: false, error: 'Please enter a valid topic name.' };
        }

        let token;
        try {
          token = await getAuthToken(false);
        } catch {
          return { success: false, error: 'Please login with Gmail to search for topics.' };
        }

        if (!token) {
          await setAuthStatus(false);
          return { success: false, error: 'Gmail authentication required. Please login again.' };
        }

        try {
          console.log(`[Background] Searching Gmail for: "${topicName}" (max 30 emails)`);
          const emails = await fetchEmailsForTopic(topicName, token, 30);

          if (!emails || emails.length === 0) {
            console.log(`[Background] No matching emails found for: "${topicName}"`);
            return {
              success: false,
              error: 'No relevant emails found for this topic.',
            };
          }

          console.log(`[Background] Found ${emails.length} emails. Extracting with Gemini...`);
          const extractedItems = await analyzeOpportunityEmails(topicName, emails);

          const existingTopics = await getFollowedTopics();
          const topicKey = topicName.toLowerCase();
          const existingIndex = existingTopics.findIndex(
            (t) => (t.name || '').toLowerCase() === topicKey
          );

          const topicPriority = computeTopicPriority(extractedItems);

          let updatedTopic;
          let updatedList = [...existingTopics];

          if (existingIndex >= 0) {
            // Update existing topic card
            updatedTopic = {
              ...existingTopics[existingIndex],
              items: extractedItems,
              priority: topicPriority,
              lastUpdated: formatCurrentTime(),
            };
            updatedList[existingIndex] = updatedTopic;
          } else {
            // Create brand new topic card (1 card per topic)
            updatedTopic = {
              id: `topic-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              name: topicName,
              topicTag: topicName,
              priority: topicPriority,
              items: extractedItems,
              isPinned: false,
              color: null,
              lastUpdated: formatCurrentTime(),
            };
            updatedList.unshift(updatedTopic);
          }

          // Sort: Pinned > Emergency > Urgent > Normal
          const priorityOrder = { emergency: 1, urgent: 2, normal: 3 };
          updatedList.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            const pA = priorityOrder[a.priority] || 3;
            const pB = priorityOrder[b.priority] || 3;
            return pA - pB;
          });

          await setFollowedTopics(updatedList);
          console.log(`[Background] Saved topic "${topicName}" with ${extractedItems.length} items.`);

          return { success: true, topics: updatedList, topic: updatedTopic };
        } catch (err) {
          console.error(`[Background] Error following topic "${topicName}":`, err);
          if (err.message === 'GMAIL_AUTH_EXPIRED') {
            await setAuthStatus(false);
            return { success: false, error: 'Gmail session expired. Please log in again.' };
          }
          return {
            success: false,
            error: err.message || 'Failed to search Gmail or extract details.',
          };
        }
      }

      case 'UNFOLLOW_TOPIC': {
        if (message.topicId) {
          await removeFollowedTopic(message.topicId);
        }
        return { success: true };
      }

      case 'REFRESH_ALL': {
        processAllTopics();
        return { success: true };
      }

      default:
        return { error: `Unknown action: ${message.action}` };
    }
  };

  handleMessage().then(sendResponse);
  return true;
});

