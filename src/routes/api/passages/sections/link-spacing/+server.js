import { passageSection } from '$lib/server/db/schema.js';
import { createLinkHandlers } from '$lib/server/db/linkGroups.js';

/**
 * PATCH /api/passages/sections/link-spacing — link the vertical spacing of 2+ sections.
 * Body: { ids: string[] }. See $lib/server/db/linkGroups.js.
 */
export const PATCH = createLinkHandlers(passageSection, 'spacingGroupId', 'section spacing', 'topOffset').link;
