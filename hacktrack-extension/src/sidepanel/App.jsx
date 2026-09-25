import React, { useState, useEffect, useCallback } from 'react';
import LoginButton from './components/LoginButton';
import FollowInput from './components/FollowInput';
import CardList from './components/CardList';
import {
  getFollowedTopics as getStoredTopics,
  setFollowedTopics as setStoredTopics,
  getAuthStatus as getStoredAuthStatus,
  setAuthStatus as setStoredAuthStatus,
  removeFollowedTopic as removeStoredTopic,
} from '../shared/storage';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [topics, setTopics] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  /**
   * 1. Data Flow: Initial Auth Verification & Loading Stored Topics
   * Strict check against background.js / chrome.identity.
   * If not authenticated, stays on the Login screen.
   */
  const checkAuthAndLoadTopics = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'GET_LOGIN_STATUS' }, async (response) => {
        const isAuth = !!(response && response.isAuthenticated);
        setIsAuthenticated(isAuth);

        if (isAuth) {
          try {
            const storedTopics = await getStoredTopics();
            setTopics(Array.isArray(storedTopics) ? storedTopics : []);
          } catch {
            setTopics([]);
          }
        } else {
          setTopics([]);
        }
        setIsLoading(false);
      });
    } else {
      // Outside Chrome Extension context
      setIsAuthenticated(false);
      setTopics([]);
      setIsLoading(false);
    }
  }, []);

  /**
   * Save topics helper to keep chrome.storage.local and state synchronized
   */
  const saveTopics = async (newTopics) => {
    setTopics(newTopics);
    await setStoredTopics(newTopics);
  };

  /**
   * 2. Data Flow: followTopic(rawTopicName)
   * Only creates and displays 1 sticky-note card per topic IF matching Gmail emails exist.
   */
  const followTopic = async (rawTopicName) => {
    let topicName = (rawTopicName || '').trim();
    // Strip user prefixes like "follow " or "follow: "
    topicName = topicName.replace(/^follow[:\s]+/i, '').trim();

    if (!topicName) return;

    setIsAddingTopic(true);
    setErrorMessage(null);

    // Call background service worker to search real Gmail & extract with Gemini
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { action: 'FOLLOW_TOPIC', topicName },
        (response) => {
          setIsAddingTopic(false);
          if (chrome.runtime.lastError) {
            setErrorMessage(chrome.runtime.lastError.message);
            return;
          }

          if (response && response.success) {
            if (response.topics && Array.isArray(response.topics)) {
              setTopics(response.topics);
            } else if (response.topic) {
              setTopics((prev) => {
                const filtered = prev.filter(
                  (t) => (t.name || '').toLowerCase() !== topicName.toLowerCase()
                );
                return [response.topic, ...filtered];
              });
            }
          } else {
            // No matching emails found or error -> Show clear message
            setErrorMessage(
              response?.error || 'No upcoming relevant emails found'
            );
          }
        }
      );
    } else {
      setIsAddingTopic(false);
      setErrorMessage('Chrome Extension runtime is not available.');
    }
  };


  /**
   * 3. Data Flow: unfollowTopic(topicId)
   * Sends message to background.js and removes topic from chrome.storage.local
   */
  const unfollowTopic = async (topicId) => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { action: 'UNFOLLOW_TOPIC', topicId },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[HackTrack] background.js unfollow notice:', chrome.runtime.lastError.message);
          }
        }
      );
    }

    const updated = topics.filter((t) => t.id !== topicId);
    setTopics(updated);
    await removeStoredTopic(topicId);
  };

  /**
   * 4. Feature: Color Dot Change per Topic
   * Updates note color and persists in chrome.storage.local
   */
  const handleColorChange = async (topicId, newColor) => {
    const updated = topics.map((t) =>
      t.id === topicId ? { ...t, color: newColor } : t
    );
    await saveTopics(updated);
  };

  /**
   * 5. Real Google OAuth Login Handler
   * Strictly gated: Only grants access to dashboard if Google OAuth succeeds.
   */
  const handleLogin = () => {
    setIsLoggingIn(true);
    setErrorMessage(null);

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'LOGIN' }, async (response) => {
        setIsLoggingIn(false);
        if (chrome.runtime.lastError) {
          console.warn('[HackTrack] background.js login error:', chrome.runtime.lastError.message);
          setIsAuthenticated(false);
          setErrorMessage(chrome.runtime.lastError.message);
          return;
        }

        if (response && response.success && response.token) {
          setIsAuthenticated(true);
          const storedTopics = await getStoredTopics();
          setTopics(Array.isArray(storedTopics) ? storedTopics : []);
        } else {
          // Authentication cancelled, denied, or failed -> Stay on Login screen
          setIsAuthenticated(false);
          setErrorMessage(
            response?.error || 'Google login was cancelled or permission was denied.'
          );
        }
      });
    } else {
      setIsLoggingIn(false);
      setIsAuthenticated(false);
      setErrorMessage('Chrome Extension runtime is not available.');
    }
  };

  /**
   * Logout Handler
   */
  const handleLogout = async () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'LOGOUT' });
    }

    setIsAuthenticated(false);
    await setStoredAuthStatus(false);
  };

  /**
   * 6. Listen for chrome.storage.onChanged
   * Auto-updates UI when background.js updates email data via periodic sync
   */
  useEffect(() => {
    checkAuthAndLoadTopics();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const storageListener = (changes, areaName) => {
        if (areaName === 'local') {
          if (changes.followedTopics) {
            setTopics(changes.followedTopics.newValue || []);
          }
          if (changes.isAuthenticated !== undefined) {
            setIsAuthenticated(!!changes.isAuthenticated.newValue);
          }
        }
      };

      chrome.storage.onChanged.addListener(storageListener);
      return () => {
        chrome.storage.onChanged.removeListener(storageListener);
      };
    }
  }, [checkAuthAndLoadTopics]);

  /**
   * 7. Pin Toggle Handler
   */
  const handleTogglePin = async (topicId) => {
    const updated = topics.map((t) =>
      t.id === topicId ? { ...t, isPinned: !t.isPinned } : t
    );
    await saveTopics(updated);
  };

  /**
   * 8. Sorting Logic (Pinned > Emergency > Urgent > Normal)
   */
  const sortedTopics = [...topics].sort((a, b) => {
    // 1. Pinned items always first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    // 2. Priority weighting: Emergency (1) > Urgent (2) > Normal (3)
    const priorityWeight = { emergency: 1, urgent: 2, normal: 3 };
    const pA = priorityWeight[a.priority] || 3;
    const pB = priorityWeight[b.priority] || 3;
    if (pA !== pB) return pA - pB;

    return 0;
  });


  return (
    <div className="panel-container">
      {!isAuthenticated ? (
        /* 1. LOGIN SCREEN */
        <div className="login-screen">
          <div className="login-brand-icon" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#854d0e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>

          <h1 className="login-title">HackTrack</h1>
          <p className="login-subtitle">
            AI-powered sticky notes for deadlines, updates, and tasks extracted directly from your Gmail.
          </p>

          <div className="login-features-list">
            <div className="login-feature-item">
              <span className="login-feature-icon">📅</span>
              <span>Automated deadline & date extraction</span>
            </div>
            <div className="login-feature-item">
              <span className="login-feature-icon">⚡</span>
              <span>Tracks hackathons & job applications</span>
            </div>
            <div className="login-feature-item">
              <span className="login-feature-icon">🔒</span>
              <span>Serverless & private (runs in your browser)</span>
            </div>
          </div>

          {/* Error Message if Login Fails / Cancelled */}
          {errorMessage && (
            <div className="error-banner" style={{ marginBottom: 16, width: '100%', maxWidth: 320 }} role="alert">
              <div className="error-banner-content">
                <span aria-hidden="true">⚠️</span>
                <span>{errorMessage}</span>
              </div>
              <button
                className="error-close-btn"
                onClick={() => setErrorMessage(null)}
                aria-label="Dismiss error"
              >
                &times;
              </button>
            </div>
          )}

          <LoginButton onClick={handleLogin} isLoading={isLoggingIn} />
        </div>
      ) : (
        /* 2. MAIN DASHBOARD */
        <>
          <header className="dashboard-header">
            <div className="brand-section">
              <div className="brand-mini-icon" aria-hidden="true">📌</div>
              <span className="brand-title">HackTrack</span>
            </div>

            <div className="auth-status-section">
              <div className="connected-badge" title="Gmail sync is active">
                <span className="pulse-dot" aria-hidden="true"></span>
                <span>Gmail Connected</span>
              </div>
              <button
                className="logout-link"
                onClick={handleLogout}
                title="Disconnect Gmail"
              >
                Logout
              </button>
            </div>
          </header>

          {/* Follow Input Field */}
          <FollowInput onFollow={followTopic} isLoading={isAddingTopic} />

          {/* Scrollable Sticky-Note Feed */}
          <CardList
            topics={sortedTopics}
            isLoading={isLoading}
            errorMessage={errorMessage}
            onDismissError={() => setErrorMessage(null)}
            onUnfollow={unfollowTopic}
            onColorChange={handleColorChange}
            onTogglePin={handleTogglePin}
          />
        </>
      )}
    </div>
  );
}
