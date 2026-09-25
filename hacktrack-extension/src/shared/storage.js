/**
 * HackTrack - Storage Helper Module
 * Exclusively manages persistent data using chrome.storage.local
 */

const STORAGE_KEYS = {
  FOLLOWED_TOPICS: 'followedTopics',
  IS_AUTHENTICATED: 'isAuthenticated',
  USER_PROFILE: 'userProfile',
  LAST_SYNC: 'lastSyncTimestamp',
};

/**
 * Generic getter for chrome.storage.local
 */
export async function getStorageData(keys, defaultValues = {}) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[Storage] Error reading chrome.storage.local:', chrome.runtime.lastError);
          resolve(defaultValues);
        } else {
          resolve({ ...defaultValues, ...result });
        }
      });
    } else {
      resolve(defaultValues);
    }
  });
}

/**
 * Generic setter for chrome.storage.local
 */
export async function setStorageData(data) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.error('[Storage] Error saving to chrome.storage.local:', chrome.runtime.lastError);
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Retrieve list of followed topics
 */
export async function getFollowedTopics() {
  const result = await getStorageData([STORAGE_KEYS.FOLLOWED_TOPICS], {
    [STORAGE_KEYS.FOLLOWED_TOPICS]: [],
  });
  return result[STORAGE_KEYS.FOLLOWED_TOPICS] || [];
}

/**
 * Save full list of followed topics
 */
export async function setFollowedTopics(topics) {
  await setStorageData({
    [STORAGE_KEYS.FOLLOWED_TOPICS]: topics,
  });
}

/**
 * Add or update a topic in storage
 */
export async function upsertFollowedTopic(topic) {
  const topics = await getFollowedTopics();
  const index = topics.findIndex(
    (t) => t.id === topic.id || t.name.toLowerCase() === topic.name.toLowerCase()
  );

  let updated;
  if (index >= 0) {
    updated = [...topics];
    updated[index] = { ...updated[index], ...topic };
  } else {
    updated = [topic, ...topics];
  }

  await setFollowedTopics(updated);
  return updated;
}

/**
 * Remove a topic by ID
 */
export async function removeFollowedTopic(topicId) {
  const topics = await getFollowedTopics();
  const updated = topics.filter((t) => t.id !== topicId);
  await setFollowedTopics(updated);
  return updated;
}

/**
 * Get current user authentication status
 */
export async function getAuthStatus() {
  const result = await getStorageData([STORAGE_KEYS.IS_AUTHENTICATED], {
    [STORAGE_KEYS.IS_AUTHENTICATED]: false,
  });
  return !!result[STORAGE_KEYS.IS_AUTHENTICATED];
}

/**
 * Set user authentication status
 */
export async function setAuthStatus(isAuthenticated) {
  await setStorageData({
    [STORAGE_KEYS.IS_AUTHENTICATED]: !!isAuthenticated,
  });
}

export { STORAGE_KEYS };
