import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { user } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';
import messages from '$lib/data/messages.json';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { userId, firstName, lastName } = await request.json();
		
		if (!userId || !firstName || !lastName) {
			return json({ error: messages.errors.missingFields }, { status: 400 });
		}

		// Update the user record with separate firstName and lastName
		await db.update(user)
			.set({ 
				firstName: firstName.trim(),
				lastName: lastName.trim()
			})
			.where(eq(user.id, userId));

		return json({ success: true });
	} catch (error) {
		console.error('Update names error:', error);
		return json({ error: messages.errors.internalServerError }, { status: 500 });
	}
};
