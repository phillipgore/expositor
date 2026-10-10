import { passageColumn } from '$lib/server/db/schema.js';
import { createLinkHandlers } from '$lib/server/db/linkGroups.js';

/**
 * PATCH /api/passages/columns/link-width — link the widths of 2+ columns.
 * Body: { ids: string[] }. See $lib/server/db/linkGroups.js.
 */
export const PATCH = createLinkHandlers(passageColumn, 'widthGroupId', 'column width').link;
