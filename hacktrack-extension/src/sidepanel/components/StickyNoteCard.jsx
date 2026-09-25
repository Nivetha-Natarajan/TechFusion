import React from 'react';

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
 * Renders an individual tracked topic with deadlines, updates, tasks, reminders,
 * unfollow action, and a 5-color pastel dot picker.
 */
export default function StickyNoteCard({ topic, onUnfollow, onColorChange, onTogglePin }) {
  const defaultBg = topic.priority === 'urgent' ? '#FFEBEE' : '#E8F5E9';
  const currentColor = topic.color || defaultBg;

  const renderSection = (icon, title, items) => {
    const hasItems = items && Array.isArray(items) && items.length > 0;

    return (
      <div className="card-section">
        <div className="section-header">
          <span className="section-icon">{icon}</span>
          <span>{title}</span>
        </div>
        {hasItems ? (
          <ul className="section-list">
            {items.map((item, idx) => (
              <li key={idx} className="section-list-item">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="section-empty">None found</p>
        )}
      </div>
    );
  };

  return (
    <article
      className={`sticky-note-card ${topic.isPinned ? 'is-pinned' : ''}`}
      style={{ backgroundColor: currentColor }}
      data-topic-id={topic.id}
    >
      {/* Top Header */}
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-title-row">
            <h3 className="card-title">{topic.name}</h3>
            {topic.priority === 'urgent' && (
              <span className="badge badge-urgent">URGENT</span>
            )}
            {topic.priority === 'normal' && (
              <span className="badge badge-normal">NORMAL</span>
            )}
          </div>
          {topic.lastUpdated && (
            <span className="card-meta">
              Updated {topic.lastUpdated}
            </span>
          )}
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
          
          {/* Unfollow Button */}
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

      {/* 4 Content Sections */}
      <div className="card-sections">
        {renderSection('📅', 'Deadlines', topic.deadlines)}
        {renderSection('⚠️', 'Updates', topic.updates)}
        {renderSection('✅', 'Tasks', topic.tasks)}
        {renderSection('🔔', 'Reminders', topic.reminders)}
      </div>

      {/* Footer: 5 Color-Dot Palette Buttons */}
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
