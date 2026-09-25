import React, { useState } from 'react';

/**
 * FollowInput Component
 * Input field and button to add a new topic to track
 */
export default function FollowInput({ onFollow, isLoading = false }) {
  const [topicName, setTopicName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = topicName.trim();
    if (!trimmed || isLoading) return;

    onFollow(trimmed);
    setTopicName('');
  };

  return (
    <div className="follow-input-container">
      <form className="follow-input-form" onSubmit={handleSubmit}>
        <div className="follow-input-wrapper">
          <span className="input-search-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            type="text"
            className="follow-text-input"
            placeholder="Follow topic (e.g. HackOn With Amazon)..."
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            disabled={isLoading}
            aria-label="New topic name"
          />
        </div>

        <button
          type="submit"
          className="btn-follow"
          disabled={!topicName.trim() || isLoading}
        >
          {isLoading ? (
            <>
              <div className="spinner" />
              <span>Adding...</span>
            </>
          ) : (
            <>
              <span>Follow</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
