import { passageColumn } from '$lib/server/db/schema.js';
import { createLinkHandlers } from '$lib/server/db/linkGroups.js';

/**
 * PATCH /api/passages/columns/unlink-spacing — unlink every spacing group the selected columns belong to.
 * Body: { ids: string[] }. See $lib/server/db/linkGroups.js.
 */
export const PATCH = createLinkHandlers(passageColumn, 'spacingGroupId', 'column spacing').unlink;
