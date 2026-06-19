import { db } from '$lib/server/db/index.js';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function PATCH({ request }) {
	// Get the current user from session
	const session = await auth.api.getSession({ headers: request.headers });
	
	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const {
			studiesPanelWidth,
			studiesPanelOpen,
			commentaryPanelWidth,
			commentaryPanelOpen,
			headingsVisible,
			notesVisible,
			passageNotesVisible,
			connectionNotesVisible,
			connectionsVisible,
			columnConnectionsVisible,
			sectionConnectionsVisible,
			segmentConnectionsVisible,
			crossItemConnectionsVisible,
			referencesVisible,
			versesVisible,
			paragraphBreaksVisible,
			wideLayout,
			overviewMode,
			selectorsVisible,
			layoutControlsVisible,
			passageDividersVisible,
			documentHeadingsVisible,
			documentNotesVisible,
			documentPassageNotesVisible,
			documentConnectionNotesVisible,
			documentConnectionsVisible,
			documentColumnConnectionsVisible,
			documentSectionConnectionsVisible,
			documentSegmentConnectionsVisible,
			documentCrossItemConnectionsVisible,
			documentVersesVisible,
			documentParagraphBreaksVisible,
			documentCommentariesVisible,
			lastStudyView,
			analyzeZoomLevel,
			analyzeZoomMode,
			documentZoomLevel,
			documentZoomMode
		} = body;



		
		// Build update object with only provided fields
		const updates = {};
		
		// Validate and add studiesPanelWidth if provided
		if (studiesPanelWidth !== undefined) {
			if (typeof studiesPanelWidth !== 'number' || studiesPanelWidth < 300 || studiesPanelWidth > 600) {
				return json({ error: 'Invalid panel width' }, { status: 400 });
			}
			updates.studiesPanelWidth = studiesPanelWidth;
		}
		
		// Validate and add studiesPanelOpen if provided
		if (studiesPanelOpen !== undefined) {
			if (typeof studiesPanelOpen !== 'boolean') {
				return json({ error: 'Invalid panel open state' }, { status: 400 });
			}
			updates.studiesPanelOpen = studiesPanelOpen;
		}
		
		// Validate and add commentaryPanelWidth if provided
		if (commentaryPanelWidth !== undefined) {
			if (typeof commentaryPanelWidth !== 'number' || commentaryPanelWidth < 300 || commentaryPanelWidth > 600) {
				return json({ error: 'Invalid commentary panel width' }, { status: 400 });
			}
			updates.commentaryPanelWidth = commentaryPanelWidth;
		}
		
		// Validate and add commentaryPanelOpen if provided
		if (commentaryPanelOpen !== undefined) {
			if (typeof commentaryPanelOpen !== 'boolean') {
				return json({ error: 'Invalid commentary panel open state' }, { status: 400 });
			}
			updates.commentaryPanelOpen = commentaryPanelOpen;
		}

		// Validate and add view toggle preferences if provided
		const booleanViewPrefs = {
			headingsVisible,
			notesVisible,
			passageNotesVisible,
			connectionNotesVisible,
			connectionsVisible,
			columnConnectionsVisible,
			sectionConnectionsVisible,
			segmentConnectionsVisible,
			crossItemConnectionsVisible,
			referencesVisible,
			versesVisible,
			paragraphBreaksVisible,
			wideLayout,
			overviewMode,
			selectorsVisible,
			layoutControlsVisible,
			passageDividersVisible,
			documentHeadingsVisible,
			documentNotesVisible,
			documentPassageNotesVisible,
			documentConnectionNotesVisible,
			documentConnectionsVisible,
			documentColumnConnectionsVisible,
			documentSectionConnectionsVisible,
			documentSegmentConnectionsVisible,
			documentCrossItemConnectionsVisible,
			documentVersesVisible,
			documentParagraphBreaksVisible,
			documentCommentariesVisible
		};

		for (const [key, value] of Object.entries(booleanViewPrefs)) {

			if (value !== undefined) {
				if (typeof value !== 'boolean') {
					return json({ error: `Invalid value for ${key}` }, { status: 400 });
				}
				updates[key] = value;
			}
		}

		// Validate and add lastStudyView if provided (a string enum, not a boolean)
		if (lastStudyView !== undefined) {
			if (lastStudyView !== 'analyze' && lastStudyView !== 'document') {
				return json({ error: 'Invalid lastStudyView' }, { status: 400 });
			}
			updates.lastStudyView = lastStudyView;
		}

		// Validate and add the per-view zoom preferences if provided. Levels are
		// percentages (a sane 25–400 range); modes are a small string enum. Analyze
		// and Document each persist their own pair so their zoom stays independent.
		const zoomLevels = { analyzeZoomLevel, documentZoomLevel };
		for (const [key, value] of Object.entries(zoomLevels)) {
			if (value !== undefined) {
				if (typeof value !== 'number' || !Number.isFinite(value) || value < 25 || value > 400) {
					return json({ error: `Invalid value for ${key}` }, { status: 400 });
				}
				updates[key] = value;
			}
		}

		const zoomModes = { analyzeZoomMode, documentZoomMode };
		for (const [key, value] of Object.entries(zoomModes)) {
			if (value !== undefined) {
				if (value !== 'percentage' && value !== 'fit-width' && value !== 'fit-study') {
					return json({ error: `Invalid value for ${key}` }, { status: 400 });
				}
				updates[key] = value;
			}
		}
		
		// Only update if there are changes


		if (Object.keys(updates).length === 0) {
			return json({ error: 'No valid preferences provided' }, { status: 400 });
		}

		// Update user preferences
		await db.update(user)
			.set(updates)
			.where(eq(user.id, session.user.id));

		return json({ success: true });
	} catch (error) {
		console.error('Error updating user preferences:', error);
		return json({ error: 'Failed to update preferences' }, { status: 500 });
	}
}
