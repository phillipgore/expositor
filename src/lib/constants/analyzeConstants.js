/**
 * Constants for the analyze page
 * Centralizes magic numbers and configuration values
 */

/**
 * Toolbar modes
 */
export const TOOLBAR_MODES = {
	OUTLINE: 'outline',
	LITERARY: 'literary',
	COLOR: 'color'
};

/**
 * Available split colors
 */
export const SPLIT_COLORS = {
	RED: 'red',
	ORANGE: 'orange',
	YELLOW: 'yellow',
	GREEN: 'green',
	AQUA: 'aqua',
	BLUE: 'blue',
	PURPLE: 'purple',
	PINK: 'pink'
};

/**
 * Word selection positions
 */
export const WORD_POSITIONS = {
	BEFORE: 'before',
	AFTER: 'after'
};

/**
 * Zoom configuration
 */
export const ZOOM_CONFIG = {
	MIN_LEVEL: 50,
	MAX_LEVEL: 200,
	DEFAULT_LEVEL: 100,
	HEADER_THRESHOLD: 100  // Show header when zoom >= this value
};

/**
 * Drag detection configuration
 */
export const DRAG_CONFIG = {
	THRESHOLD_PIXELS: 3  // Distance in pixels before considering it a drag
};

/**
 * Layout configuration
 */
export const LAYOUT_CONFIG = {
	COLUMN_WIDTH_NORMAL: '28.8rem',
	COLUMN_WIDTH_WIDE: '50.4rem',
	SPLIT_MARGIN_TOP: '4.4rem',
	CONTENT_GAP: '4.4rem',
	CONTENT_PADDING: '6.6rem 4.4rem 1.8rem'
};

/**
 * CSS selectors (for DOM queries)
 */
export const SELECTORS = {
	PASSAGE: '.passage',
	SEGMENT: '.segment',
	SPLIT: '.split',
	SELECTABLE_WORD: '.selectable-word',
	SELECTABLE_SPACE: '.selectable-space',
	ANALYZE_CONTENT: '.analyze-content'
};

/**
 * Data attribute names
 */
export const DATA_ATTRIBUTES = {
	PASSAGE_INDEX: 'data-passage-index',
	WORD_INDEX: 'data-word-index',
	SELECTED: 'data-selected',
	POSITION: 'data-position',
	SUPPRESS_HOVER_CARET: 'data-suppress-hover-caret'
};

/**
 * CSS class names
 */
export const CSS_CLASSES = {
	ACTIVE: 'active',
	HIDE_VERSES: 'hide-verses',
	WIDE_LAYOUT: 'wide-layout',
	OVERVIEW_MODE: 'overview-mode'
};
