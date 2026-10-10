import { passageColumn } from '$lib/server/db/schema.js';
import { createLinkHandlers } from '$lib/server/db/linkGroups.js';

/**
 * PATCH /api/passages/columns/link-spacing — link the horizontal spacing of 2+ columns.
 * Body: { ids: string[] }. See $lib/server/db/linkGroups.js.
 */
export const PATCH = createLinkHandlers(passageColumn, 'spacingGroupId', 'column spacing', 'leftOffset').link;
