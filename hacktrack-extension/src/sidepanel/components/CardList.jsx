import React from 'react';
import StickyNoteCard from './StickyNoteCard';

/**
 * CardList Component
 * Renders the scrollable feed of sticky notes, handles loading skeletons,
 * empty state, and error message banners.
 */
export default function CardList({
  topics = [],
  isLoading = false,
  errorMessage = null,
  onDismissError,
  onUnfollow,
  onColorChange,
}) {
  return (
    <div className="card-list-scroll">
      {/* Error Banner */}
      {errorMessage && (
        <div className="error-banner" role="alert">
          <div className="error-banner-content">
            <span aria-hidden="true">⚠️</span>
            <span>{errorMessage}</span>
          </div>
          {onDismissError && (
            <button
              className="error-close-btn"
              onClick={onDismissError}
              aria-label="Dismiss error"
            >
              &times;
            </button>
          )}
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading && topics.length === 0 && (
        <>
          <div className="skeleton-card">
            <div className="skeleton-shimmer skeleton-title"></div>
            <div className="skeleton-shimmer skeleton-block"></div>
            <div className="skeleton-shimmer skeleton-block"></div>
            <div className="skeleton-shimmer skeleton-dots"></div>
          </div>
          <div className="skeleton-card">
            <div className="skeleton-shimmer skeleton-title" style={{ width: '45%' }}></div>
            <div className="skeleton-shimmer skeleton-block"></div>
            <div className="skeleton-shimmer skeleton-dots"></div>
          </div>
        </>
      )}

      {/* Empty State */}
      {!isLoading && topics.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">
            📝
          </div>
          <h4 className="empty-state-title">No Topics Tracked</h4>
          <p className="empty-state-text">
            You're not following any topics yet — add one above!
          </p>
        </div>
      )}

      {/* Topics Stack */}
      {topics.map((topic) => (
        <StickyNoteCard
          key={topic.id}
          topic={topic}
          onUnfollow={onUnfollow}
          onColorChange={onColorChange}
        />
      ))}
    </div>
  );
}
