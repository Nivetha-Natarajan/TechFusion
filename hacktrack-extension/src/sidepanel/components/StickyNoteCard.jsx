import React, { useState } from 'react';

/**
 * 5 Pastel Colors for Sticky Notes
 * Restricted strictly to light/pastel hex values to ensure readability and sticky-note feel.
 */
export const PASTEL_COLORS = [
  { id: 'yellow', label: 'Pale Yellow', hex: '#FFF9C4' },
  { id: 'pink', label: 'Soft Pink', hex: '#FCE4EC' },
  { id: 'mint', label: 'Mint Green', hex: '#E8F5E9' },
  { id: 'blue', label: 'Light Blue', hex: '#E1F5FE' },
  { id: 'lavender', label: 'Lavender', hex: '#F3E5F5' },
];

export const DEFAULT_NOTE_COLOR = '#FFF9C4';

/**
 * StickyNoteCard Component
 * Renders ONE sticky note for a followed topic containing a list of upcoming opportunities/events.
 * Each item displays in a compact format with emergency star (0-2 days) and expands into bullet details when clicked.
 */
export default function StickyNoteCard({ topic, onUnfollow, onColorChange, onTogglePin }) {
  const [expandedItemId, setExpandedItemId] = useState(null);

  const getDefaultBg = (priority) => {
    switch (priority) {
      case 'emergency':
        return '#FFF1F2'; // Soft pastel rose/red
      case 'urgent':
        return '#FFFBEB'; // Soft pastel amber
      case 'normal':
      default:
        return '#F0FDF4'; // Soft pastel mint/green
    }
  };

  const currentColor = topic.color || getDefaultBg(topic.priority);

  const toggleExpand = (itemId) => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  };

  const hasItems = topic.items && Array.isArray(topic.items) && topic.items.length > 0;

  return (
    <article
      className={`sticky-note-card ${topic.isPinned ? 'is-pinned' : ''}`}
      style={{ backgroundColor: currentColor }}
      data-topic-id={topic.id}
    >
      {/* Card Header */}
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-title-row">
            <h3 className="card-title">{topic.name}</h3>
            {topic.priority === 'emergency' && (
              <span className="badge badge-emergency">EMERGENCY</span>
            )}
            {topic.priority === 'urgent' && (
              <span className="badge badge-urgent">URGENT</span>
            )}
            {topic.priority === 'normal' && (
              <span className="badge badge-normal">NORMAL</span>
            )}
          </div>
          <div className="card-meta">
            {topic.lastUpdated && <span>Updated {topic.lastUpdated}</span>}
            {hasItems && (
              <span>• {topic.items.length} upcoming {topic.items.length === 1 ? 'event' : 'events'}</span>
            )}
          </div>
        </div>

        <div className="card-actions">
          {/* Pin Button */}
          <button
            className={`btn-pin ${topic.isPinned ? 'pinned' : ''}`}
            onClick={() => onTogglePin(topic.id)}
            title={topic.isPinned ? 'Unpin this topic' : 'Pin this topic'}
            aria-label={topic.isPinned ? 'Unpin this topic' : 'Pin this topic'}
          >
            📌
          </button>

          {/* Unfollow / Delete Button */}
          <button
            className="btn-unfollow"
            onClick={() => onUnfollow(topic.id)}
            title={`Unfollow ${topic.name}`}
            aria-label={`Unfollow ${topic.name}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Card Items List (One-line items with expand/collapse) */}
      <div className="topic-items-list">
        {hasItems ? (
          topic.items.map((item) => {
            const isExpanded = expandedItemId === item.id;
            const daysLabel =
              item.daysRemaining === 0
                ? 'Due Today'
                : item.daysRemaining === 1
                ? '1 day left'
                : item.daysRemaining !== null && item.daysRemaining < 999
                ? `${item.daysRemaining} days left`
                : null;

            return (
              <div
                key={item.id}
                className={`topic-item-container ${isExpanded ? 'is-expanded' : ''} ${item.isEmergency ? 'has-emergency' : ''}`}
              >
                {/* One-Line Clickable Row */}
                <button
                  type="button"
                  className="topic-item-row"
                  onClick={() => toggleExpand(item.id)}
                  aria-expanded={isExpanded}
                >
                  <div className="topic-item-header-line">
                    <span className="topic-item-title-wrap">
                      {item.isEmergency && (
                        <span className="emergency-star" title="Emergency: Due in 0-2 days">
                          ⭐
                        </span>
                      )}
                      <span className="topic-item-title">{item.title}</span>
                      {item.formattedDate && (
                        <span className="topic-item-date">— 📅 {item.formattedDate}</span>
                      )}
                    </span>
                    <span className="item-expand-arrow">{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {/* Summary & Received Time Sub-row */}
                  <div className="topic-item-sub-row">
                    {item.summary && (
                      <p className="topic-item-summary-line">{item.summary}</p>
                    )}
                    {item.receivedDate && (
                      <span className="topic-item-received-tag" title="Date & time email was received">
                        📩 {item.receivedDate}
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded Detailed Accordion Content */}
                {isExpanded && (
                  <div className="topic-item-details-drawer">
                    {/* Mail Received Date & Time Highlight */}
                    {item.receivedDate && (
                      <div className="detail-received-banner">
                        <span className="detail-received-icon">📩</span>
                        <div className="detail-received-info">
                          <span className="detail-received-label">Mail Received:</span>
                          <strong className="detail-received-time">{item.receivedDate}</strong>
                        </div>
                      </div>
                    )}

                    {/* Deadlines */}
                    {item.deadlines && item.deadlines.length > 0 && (
                      <div className="detail-section">
                        <div className="detail-section-title">
                          <span>📅</span>
                          <strong>Deadlines</strong>
                        </div>
                        <ul className="detail-bullet-list">
                          {item.deadlines.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Tasks / Actions */}
                    {item.tasks && item.tasks.length > 0 && (
                      <div className="detail-section">
                        <div className="detail-section-title">
                          <span>✅</span>
                          <strong>Tasks / Actions</strong>
                        </div>
                        <ul className="detail-bullet-list">
                          {item.tasks.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Reminders */}
                    {item.reminders && item.reminders.length > 0 && (
                      <div className="detail-section">
                        <div className="detail-section-title">
                          <span>🔔</span>
                          <strong>Reminders</strong>
                        </div>
                        <ul className="detail-bullet-list">
                          {item.reminders.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Updates */}
                    {item.updates && item.updates.length > 0 && (
                      <div className="detail-section">
                        <div className="detail-section-title">
                          <span>⚠️</span>
                          <strong>Updates</strong>
                        </div>
                        <ul className="detail-bullet-list">
                          {item.updates.map((u, i) => (
                            <li key={i}>{u}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Source & Days Badge Footer */}
                    <div className="detail-meta-footer">
                      <span className="detail-source-tag">
                        Source: Gmail {item.receivedDate ? `• ${item.receivedDate}` : ''}
                      </span>
                      {daysLabel && (
                        <span className={`detail-days-pill ${item.isEmergency ? 'emergency-pill' : ''}`}>
                          {daysLabel}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

            );
          })
        ) : (
          <div className="no-items-placeholder">
            <p className="no-items-text">No upcoming relevant emails found.</p>
          </div>
        )}
      </div>

      {/* Card Footer: 5 Color-Dot Palette Buttons */}
      <div className="card-footer">
        <span className="color-picker-label">Color</span>
        <div className="color-dots-row" role="radiogroup" aria-label="Card color selection">
          {PASTEL_COLORS.map((c) => {
            const isSelected = currentColor.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                key={c.id}
                type="button"
                className={`color-dot-btn ${isSelected ? 'active' : ''}`}
                style={{ backgroundColor: c.hex }}
                onClick={() => onColorChange(topic.id, c.hex)}
                title={c.label}
                aria-label={`Change note color to ${c.label}`}
                aria-checked={isSelected}
                role="radio"
              />
            );
          })}
        </div>
      </div>
    </article>
  );
}

