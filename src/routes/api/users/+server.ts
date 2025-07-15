import { json } from '@sveltejs/kit';
import { createUser, getAllUsers } from '$lib/db/queries';
import type { NewUser } from '$lib/db/schema';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	try {
		const users = await getAllUsers();
		return json(users);
	} catch (error) {
		console.error('Error fetching users:', error);
		return json({ error: 'Failed to fetch users' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const userData: NewUser = await request.json();
		const newUser = await createUser(userData);
		return json(newUser, { status: 201 });
	} catch (error) {
		console.error('Error creating user:', error);
		return json({ error: 'Failed to create user' }, { status: 500 });
	}
};
