import { passageColumn } from '$lib/server/db/schema.js';
import { createBatchOffsetHandler } from '$lib/server/db/linkGroups.js';

/**
 * PATCH /api/passages/columns/batch-spacing — write per-column leftOffset values at once.
 * Body: { offsets: Record<columnId, number | null> }. See $lib/server/db/linkGroups.js.
 */
export const PATCH = createBatchOffsetHandler(passageColumn, 'leftOffset', 'column spacing');
