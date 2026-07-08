import { pgTable, text, timestamp, boolean, integer, real, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Application-wide settings. This is a single-row table (id = 'app') that
 * holds global flags the Back Office can flip at runtime — e.g. whether new
 * user sign-ups are currently allowed. Reads are self-healing: server code
 * inserts the default row if it is missing.
 */
export const appSettings = pgTable('app_settings', {
	id: text('id').primaryKey(),
	/** When false, new user sign-ups are blocked (except seeded admin/dev accounts). */
	signupsEnabled: boolean('signups_enabled').notNull().default(true),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const user = pgTable('user', {

	id: text('id').primaryKey(),
	name: text('name').notNull(),
	firstName: text('first_name').notNull(),
	lastName: text('last_name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified')
		.$defaultFn(() => false)
		.notNull(),
	image: text('image'),
	studiesPanelWidth: integer('studies_panel_width').default(300),
	studiesPanelOpen: boolean('studies_panel_open').default(true),
	commentaryPanelWidth: integer('commentary_panel_width').default(300),
	commentaryPanelOpen: boolean('commentary_panel_open').default(false),
	headingsVisible: boolean('headings_visible').default(true),
	notesVisible: boolean('notes_visible').default(true),
	passageNotesVisible: boolean('passage_notes_visible').default(true),
	connectionNotesVisible: boolean('connection_notes_visible').default(true),
	connectionsVisible: boolean('connections_visible').default(true),
	columnConnectionsVisible: boolean('column_connections_visible').default(true),
	sectionConnectionsVisible: boolean('section_connections_visible').default(true),
	segmentConnectionsVisible: boolean('segment_connections_visible').default(true),
	crossItemConnectionsVisible: boolean('cross_item_connections_visible').default(true),
	referencesVisible: boolean('references_visible').default(false),
	versesVisible: boolean('verses_visible').default(false),
	paragraphBreaksVisible: boolean('paragraph_breaks_visible').default(false),
	wideLayout: boolean('wide_layout').default(false),
	overviewMode: boolean('overview_mode').default(false),
	selectorsVisible: boolean('selectors_visible').default(false),
	layoutControlsVisible: boolean('layout_controls_visible').default(false),
	passageDividersVisible: boolean('passage_dividers_visible').default(true),
	// Per-view View-menu toggles: the Document view keeps its OWN visibility
	// settings, independent of the Analyze view above (mirrors the per-view zoom
	// pattern). Only the toggles that are meaningful on the read-only Document page
	// are duplicated here; layout/editing-only toggles (passage dividers, wide,
	// overview, selectors, layout controls) have no Document counterpart.
	// Commentaries are shown by default; everything else mirrors the Analyze default.
	documentHeadingsVisible: boolean('document_headings_visible').default(true),
	documentNotesVisible: boolean('document_notes_visible').default(true),
	documentPassageNotesVisible: boolean('document_passage_notes_visible').default(true),
	documentConnectionNotesVisible: boolean('document_connection_notes_visible').default(true),
	documentConnectionsVisible: boolean('document_connections_visible').default(true),
	documentColumnConnectionsVisible: boolean('document_column_connections_visible').default(true),
	documentSectionConnectionsVisible: boolean('document_section_connections_visible').default(true),
	documentSegmentConnectionsVisible: boolean('document_segment_connections_visible').default(true),
	documentCrossItemConnectionsVisible: boolean('document_cross_item_connections_visible').default(true),
	documentVersesVisible: boolean('document_verses_visible').default(false),
	documentParagraphBreaksVisible: boolean('document_paragraph_breaks_visible').default(false),
	documentCommentariesVisible: boolean('document_commentaries_visible').default(true),
	// Remembers the last study view ('analyze' | 'document') the user was in, so
	// re-entering a study (or opening a different one) restores the same view.
	lastStudyView: text('last_study_view').default('analyze'),

	// Per-view zoom: the Analyze and Document views keep INDEPENDENT zoom settings
	// (level + mode) so changing zoom in one never affects the other. Each pair is
	// persisted so it survives reloads. Level is a percentage; mode is
	// 'percentage' | 'fit-width' | 'fit-study'.
	analyzeZoomLevel: integer('analyze_zoom_level').default(100),
	analyzeZoomMode: text('analyze_zoom_mode').default('percentage'),
	documentZoomLevel: integer('document_zoom_level').default(100),
	documentZoomMode: text('document_zoom_mode').default('percentage'),

	createdAt: timestamp('created_at')

		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
});

export const account = pgTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
});

export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()),
	updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date())
});

export const studyGroup = pgTable('study_group', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	subtitle: text('subtitle'),
	description: text('description'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	parentGroupId: text('parent_group_id').references(() => studyGroup.id, { onDelete: 'cascade' }),
	displayOrder: integer('display_order').notNull().default(0),
	isCollapsed: boolean('is_collapsed').notNull().default(false),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const study = pgTable('study', {
	id: text('id').primaryKey(),
	title: text('title').notNull(),
	subtitle: text('subtitle'),
	translation: text('translation').notNull().default('esv'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	groupId: text('group_id').references(() => studyGroup.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const passage = pgTable('passage', {
	id: text('id').primaryKey(),
	studyId: text('study_id')
		.notNull()
		.references(() => study.id, { onDelete: 'cascade' }),
	testament: text('testament').notNull(),
	bookId: text('book_id').notNull(),
	bookName: text('book_name').notNull(),
	fromChapter: integer('from_chapter').notNull(),
	toChapter: integer('to_chapter').notNull(),
	fromVerse: integer('from_verse').notNull(),
	toVerse: integer('to_verse').notNull(),
	displayOrder: integer('display_order').notNull().default(0),
	// Cached, fully-processed passage text (post-wrapWords HTML). NULL = not yet
	// cached; the loader fetches live and lazily backfills this on first read. The
	// verse range + study translation fully identify the content, so this is a
	// complete cache key — invalidated on range change in the edit flow.
	cachedText: text('cached_text'),
	textCachedAt: timestamp('text_cached_at'),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const passageColumn = pgTable('passage_column', {
	id: text('id').primaryKey(),
	passageId: text('passage_id')
		.notNull()
		.references(() => passage.id, { onDelete: 'cascade' }),
	startingWordId: text('starting_word_id').notNull(),
	/**
	 * Extra horizontal spacing (in CSS px) ADDED to the gap on this column's LEADING
	 * (left) side, beyond its default gap. NULL/0 = default spacing. Used to push a
	 * column to the right so it visually separates from the previous column. Cannot
	 * make a column tighter than the default — the value is an additive offset on top
	 * of the CSS default. The first column in a passage is never offset. The total gap
	 * (default + offset) has no upper limit.
	 */
	leftOffset: integer('left_offset'),
	/**
	 * User-set column WIDTH in CSS px. NULL = default width (the CSS default,
	 * currently 27.8rem / 49.8rem in wide layout). A positive integer overrides
	 * the column's width so the viewer can widen or narrow it. Cannot be smaller
	 * than the application-enforced minimum readable width.
	 */
	width: integer('width'),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
}, (table) => ({
	passageIdIdx: index('passage_column_passage_id_idx').on(table.passageId),


	startingWordIdx: index('passage_column_starting_word_idx').on(table.startingWordId)
}));

export const passageSection = pgTable('passage_section', {
	id: text('id').primaryKey(),
	passageColumnId: text('passage_column_id')
		.notNull()
		.references(() => passageColumn.id, { onDelete: 'cascade' }),
	startingWordId: text('starting_word_id').notNull(),
	color: text('color').notNull().default('blue'),
	/**
	 * Extra vertical spacing (in CSS px) ADDED above this section beyond its default
	 * gap. NULL/0 = default spacing. Used to push a section down so it visually aligns
	 * with sections/segments in other columns. Cannot make a section tighter than the
	 * default — the value is an additive offset on top of the CSS default margin-top.
	 */
	topOffset: integer('top_offset'),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
}, (table) => ({
	columnIdIdx: index('passage_section_column_id_idx').on(table.passageColumnId),

	startingWordIdx: index('passage_section_starting_word_idx').on(table.startingWordId),
	colorCheck: sql`CHECK (color IN ('red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'pink'))`
}));

export const passageSegment = pgTable('passage_segment', {
	id: text('id').primaryKey(),
	passageSectionId: text('passage_section_id')
		.notNull()
		.references(() => passageSection.id, { onDelete: 'cascade' }),
	startingWordId: text('starting_word_id').notNull(),
	note: text('note'),
	commentary: text('commentary'),

	/** User-set minimum height in pixels. NULL = flexible/natural height (content-sized). */
	height: integer('height'),
	/**
	 * Shared identifier for LINKED segment heights. Segments sharing the same
	 * heightGroupId are kept at the height of the tallest member and resize
	 * together; if any member grows (resize, added text/heading/note) they all
	 * grow. NULL = not linked (default).
	 */
	heightGroupId: text('height_group_id'),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
}, (table) => ({
	sectionIdIdx: index('passage_segment_section_id_idx').on(table.passageSectionId),

	startingWordIdx: index('passage_segment_starting_word_idx').on(table.startingWordId)
}));

/**
 * A heading attached to a segment. Headings were previously three nullable text
 * columns on passage_segment (heading_one/two/three); they now live as their own
 * rows so each heading is an addressable, commentable entity (with its own id and
 * commentary), consistent with how sections/columns/segments/connections carry
 * commentary. A segment has at most one heading of each type (enforced by the
 * unique index on passage_segment_id + heading_type).
 */
export const passageHeading = pgTable('passage_heading', {
	id: text('id').primaryKey(),
	passageSegmentId: text('passage_segment_id')
		.notNull()
		.references(() => passageSegment.id, { onDelete: 'cascade' }),
	/** Which heading level this is: 'one' | 'two' | 'three'. */
	headingType: text('heading_type').notNull(),
	/** The heading's display text/label. */
	text: text('text').notNull(),
	/** Rich-text commentary for this heading (mirrors passage_segment.commentary). */
	commentary: text('commentary'),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
}, (table) => ({
	segmentIdIdx: index('passage_heading_segment_id_idx').on(table.passageSegmentId),
	segmentTypeUnique: index('passage_heading_segment_type_unique').on(
		table.passageSegmentId,
		table.headingType
	),
	headingTypeCheck: sql`CHECK (heading_type IN ('one', 'two', 'three'))`
}));

export const segmentConnection = pgTable('segment_connection', {

	id: text('id').primaryKey(),
	studyId: text('study_id')
		.notNull()
		.references(() => study.id, { onDelete: 'cascade' }),
	/** Per-end type: 'segment' | 'section' | 'column' — independent so cross-type connections are possible */
	fromType: text('from_type').notNull().default('segment'),
	toType:   text('to_type').notNull().default('segment'),
	// Segment connection fields (nullable — only set when fromType/toType = 'segment')
	fromSegmentId: text('from_segment_id')
		.references(() => passageSegment.id, { onDelete: 'cascade' }),
	toSegmentId: text('to_segment_id')
		.references(() => passageSegment.id, { onDelete: 'cascade' }),
	// Section connection fields (nullable — only set when connectionType = 'section')
	fromSectionId: text('from_section_id')
		.references(() => passageSection.id, { onDelete: 'cascade' }),
	toSectionId: text('to_section_id')
		.references(() => passageSection.id, { onDelete: 'cascade' }),
	// Column connection fields (nullable — only set when connectionType = 'column')
	fromColumnId: text('from_column_id')
		.references(() => passageColumn.id, { onDelete: 'cascade' }),
	toColumnId: text('to_column_id')
		.references(() => passageColumn.id, { onDelete: 'cascade' }),
	// Short plain-text quick note for this connection (mirrors passage_segment.note)
	note: text('note'),
	/**
	 * Which edge of the note card the anchor dot attaches to: 'top' | 'right' |
	 * 'bottom' | 'left'. NULL = default 'top'. The card extends away from this edge.
	 */
	noteAnchorSide: text('note_anchor_side'),
	/**
	 * Position of the anchor dot ALONG the connection's bezier curve, 0…1.
	 * NULL = default 0.5 (the curve midpoint). The user slides the dot along the line.
	 */
	noteAnchorT: real('note_anchor_t'),
	/**
	 * Signed pixel distance the card is slid ALONG its anchored edge (perpendicular
	 * to the anchor direction): horizontal for top/bottom, vertical for left/right.
	 * NULL/0 = centered on the dot.
	 */
	noteOffset: integer('note_offset'),
	/**
	 * Unsigned pixel distance the card floats AWAY from the connection line,
	 * measured PERPENDICULAR to its anchored edge (the axis the dot would travel
	 * straight off the line). NULL/0 = flush against the line (today's default).
	 */
	noteLead: integer('note_lead'),
	// Rich text commentary for this connection (mirrors passage_segment.commentary)

	commentary: text('commentary'),
	createdAt: timestamp('created_at')
		.$defaultFn(() => new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => new Date())
		.notNull()
}, (table) => ({
	studyIdIdx: index('segment_connection_study_id_idx').on(table.studyId),
	fromSegmentIdIdx: index('segment_connection_from_segment_id_idx').on(table.fromSegmentId),
	toSegmentIdIdx: index('segment_connection_to_segment_id_idx').on(table.toSegmentId),
	fromSectionIdIdx: index('segment_connection_from_section_id_idx').on(table.fromSectionId),
	toSectionIdIdx: index('segment_connection_to_section_id_idx').on(table.toSectionId),
	fromColumnIdIdx: index('segment_connection_from_column_id_idx').on(table.fromColumnId),
	toColumnIdIdx: index('segment_connection_to_column_id_idx').on(table.toColumnId)
}));

