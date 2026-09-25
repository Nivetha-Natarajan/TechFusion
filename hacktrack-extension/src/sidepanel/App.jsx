import React, { useState, useEffect, useCallback } from 'react';
import LoginButton from './components/LoginButton';
import FollowInput from './components/FollowInput';
import CardList from './components/CardList';
import { DEFAULT_NOTE_COLOR } from './components/StickyNoteCard';

/**
 * Initial sample/mock topics to ensure the UI is fully visible and testable
 * before the background service worker is linked.
 */
const SAMPLE_TOPICS = [
  {
    id: 'topic-1',
    name: 'HackOn With Amazon',
    color: '#FFF9C4', // Pale Yellow
    lastUpdated: '10 mins ago',
    deadlines: [
      'Round 1 Submission: Oct 12, 11:59 PM',
      'Team Registration: Oct 05, 6:00 PM',
    ],
    updates: [
      'API keys & problem statements released in Slack portal',
    ],
    tasks: [
      'Submit GitHub repository link',
      'Record 2-min prototype demo video',
    ],
    reminders: [
      'Join orientation webinar on Oct 2nd at 5 PM IST',
    ],
  },
  {
    id: 'topic-2',
    name: 'Google Summer of Code 2026',
    color: '#E8F5E9', // Mint Green
    lastUpdated: '1 hour ago',
    deadlines: [
      'Contributor proposal deadline: April 2, 18:00 UTC',
    ],
    updates: [
      'Mentoring organizations announced publicly',
    ],
    tasks: [
      'Draft proposal document on Google Docs',
      'Introduce self on organization Discord channel',
    ],
    reminders: [], // Will render "None found"
  },
  {
    id: 'topic-3',
    name: 'Uber Star Internships',
    color: '#E1F5FE', // Light Blue
    lastUpdated: 'Yesterday',
    deadlines: [], // Will render "None found"
    updates: [
      'Application under review by university recruiter',
    ],
    tasks: [
      'Complete 70-minute HackerRank assessment by Sunday',
    ],
    reminders: [
      'Review Graph theory and dynamic programming patterns',
    ],
  },
];

/**
 * Storage & Chrome API Helpers (Safely handles both Chrome Extension & standalone dev)
 */
const isChromeAvailable = () =>
  typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [topics, setTopics] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  /**
   * 1. Data Flow: getFollowedTopics()
   * Loads followed topics from chrome.storage.local, or seeds mock data
   */
  const getFollowedTopics = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (isChromeAvailable()) {
        chrome.storage.local.get(['followedTopics', 'isAuthenticated'], (result) => {
          if (chrome.runtime.lastError) {
            console.warn('Error reading chrome.storage:', chrome.runtime.lastError);
            setTopics(SAMPLE_TOPICS);
            setIsAuthenticated(true);
          } else {
            if (result.followedTopics && Array.isArray(result.followedTopics)) {
              setTopics(result.followedTopics);
            } else {
              // Seed with sample data on first run
              setTopics(SAMPLE_TOPICS);
              chrome.storage.local.set({ followedTopics: SAMPLE_TOPICS });
            }

            if (typeof result.isAuthenticated === 'boolean') {
              setIsAuthenticated(result.isAuthenticated);
            }
          }
          setIsLoading(false);
        });
      } else {
        // Fallback for standalone/local browser preview
        const localSaved = localStorage.getItem('hacktrack_topics');
        const localAuth = localStorage.getItem('hacktrack_auth');

        if (localSaved) {
          try {
            setTopics(JSON.parse(localSaved));
          } catch {
            setTopics(SAMPLE_TOPICS);
          }
        } else {
          setTopics(SAMPLE_TOPICS);
          localStorage.setItem('hacktrack_topics', JSON.stringify(SAMPLE_TOPICS));
        }

        setIsAuthenticated(localAuth !== null ? localAuth === 'true' : true);
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Failed to get followed topics:', err);
      setErrorMessage('Failed to load tracked topics.');
      setTopics(SAMPLE_TOPICS);
      setIsLoading(false);
    }
  }, []);

  /**
   * Save topics helper to keep chrome.storage and state synchronized
   */
  const saveTopics = (newTopics) => {
    setTopics(newTopics);
    if (isChromeAvailable()) {
      chrome.storage.local.set({ followedTopics: newTopics });
    } else {
      localStorage.setItem('hacktrack_topics', JSON.stringify(newTopics));
    }
  };

  /**
   * 2. Data Flow: followTopic(topicName)
   * Sends message to background.js to start tracking a new topic
   */
  const followTopic = async (topicName) => {
    if (!topicName || !topicName.trim()) return;

    // Check for duplicate
    const exists = topics.some(
      (t) => t.name.toLowerCase() === topicName.trim().toLowerCase()
    );
    if (exists) {
      setErrorMessage(`You are already following "${topicName.trim()}".`);
      return;
    }

    setIsAddingTopic(true);
    setErrorMessage(null);

    // Call background.js via chrome.runtime.sendMessage
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { action: 'FOLLOW_TOPIC', topicName: topicName.trim() },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn(
              'background.js message failed or not running yet, using client fallback:',
              chrome.runtime.lastError.message
            );
          }
          if (response && response.error) {
            setErrorMessage(response.error);
          }
        }
      );
    }

    // Client-side optimistic update with sample card structure
    const newTopic = {
      id: `topic-${Date.now()}`,
      name: topicName.trim(),
      color: DEFAULT_NOTE_COLOR,
      lastUpdated: 'Just now',
      deadlines: ['Scanning incoming emails...'],
      updates: ['AI topic extraction initiated'],
      tasks: [],
      reminders: [],
    };

    const updated = [newTopic, ...topics];
    saveTopics(updated);
    setIsAddingTopic(false);
  };

  /**
   * 3. Data Flow: unfollowTopic(topicId)
   * Sends message to background.js and removes topic locally
   */
  const unfollowTopic = (topicId) => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { action: 'UNFOLLOW_TOPIC', topicId },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('background.js unfollow notice:', chrome.runtime.lastError.message);
          }
        }
      );
    }

    const updated = topics.filter((t) => t.id !== topicId);
    saveTopics(updated);
  };

  /**
   * 4. Feature: Color Dot Change per Topic
   * Updates note color and persists in storage
   */
  const handleColorChange = (topicId, newColor) => {
    const updated = topics.map((t) =>
      t.id === topicId ? { ...t, color: newColor } : t
    );
    saveTopics(updated);
  };

  /**
   * 5. Auth Handlers
   */
  const handleLogin = () => {
    setIsLoggingIn(true);
    setErrorMessage(null);

    // Call background.js to trigger chrome.identity
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'LOGIN' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('background.js login notice:', chrome.runtime.lastError.message);
        }
        if (response && response.error) {
          setErrorMessage(response.error);
        }
      });
    }

    // Set authenticated state and persist
    setTimeout(() => {
      setIsAuthenticated(true);
      setIsLoggingIn(false);
      if (isChromeAvailable()) {
        chrome.storage.local.set({ isAuthenticated: true });
      } else {
        localStorage.setItem('hacktrack_auth', 'true');
      }
    }, 400);
  };

  const handleLogout = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'LOGOUT' });
    }

    setIsAuthenticated(false);
    if (isChromeAvailable()) {
      chrome.storage.local.set({ isAuthenticated: false });
    } else {
      localStorage.setItem('hacktrack_auth', 'false');
    }
  };

  /**
   * 6. Listen for chrome.storage.onChanged
   * Auto-updates UI when background.js refreshes email data (every 2 mins)
   */
  useEffect(() => {
    getFollowedTopics();

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
  }, [getFollowedTopics]);

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

          <h1 className="login-title">HackTrack AI</h1>
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

          <LoginButton onClick={handleLogin} isLoading={isLoggingIn} />
        </div>
      ) : (
        /* 2. MAIN DASHBOARD */
        <>
          <header className="dashboard-header">
            <div className="brand-section">
              <div className="brand-mini-icon" aria-hidden="true">📌</div>
              <span className="brand-title">HackTrack AI</span>
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
            topics={topics}
            isLoading={isLoading}
            errorMessage={errorMessage}
            onDismissError={() => setErrorMessage(null)}
            onUnfollow={unfollowTopic}
            onColorChange={handleColorChange}
          />
        </>
      )}
    </div>
  );
}
