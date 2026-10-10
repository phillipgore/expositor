import { passageSection } from '$lib/server/db/schema.js';
import { createLinkHandlers } from '$lib/server/db/linkGroups.js';

/**
 * PATCH /api/passages/sections/unlink-spacing — unlink every spacing group the selected sections belong to.
 * Body: { ids: string[] }. See $lib/server/db/linkGroups.js.
 */
export const PATCH = createLinkHandlers(passageSection, 'spacingGroupId', 'section spacing').unlink;
