# TypeScript + Drizzle Setup

This document outlines the TypeScript and Drizzle ORM setup for the Expositor app.

## What Was Added

### TypeScript Configuration
- **tsconfig.json**: Main TypeScript configuration extending SvelteKit's base config
- **src/app.d.ts**: SvelteKit app type definitions
- Removed **jsconfig.json** (replaced with TypeScript)

### Dependencies Added
- `typescript`: TypeScript compiler
- `@types/uuid`: Type definitions for UUID library
- `svelte-check`: TypeScript checking for Svelte files

### Database Setup
- **src/lib/db/index.ts**: Main database connection with typed schema
- **src/lib/db/schema.ts**: Database schema definitions with TypeScript types
- **src/lib/db/queries.ts**: Type-safe database query functions
- **drizzle.config.ts**: Drizzle Kit configuration for migrations

### Environment Setup
- Moved `.env` file to project root (from `static/private/.env`)
- Environment variables are now properly typed through SvelteKit

## Database Schema

The setup includes example tables:

### Users Table
```typescript
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### Documents Table
```typescript
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  isPublished: boolean('is_published').default(false).notNull(),
  authorId: serial('author_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

## Type Safety

The setup provides full type safety:

```typescript
// Inferred types from schema
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
```

## Available Scripts

### TypeScript Checking
```bash
npm run check          # Check TypeScript and Svelte files
npm run check:watch    # Watch mode for type checking
```

### Database Operations
```bash
npm run db:generate    # Generate migration files
npm run db:migrate     # Run migrations
npm run db:push        # Push schema changes directly
npm run db:studio      # Open Drizzle Studio
```

## Example Usage

### API Route with Types
```typescript
import { json } from '@sveltejs/kit';
import { createUser, getAllUsers } from '$lib/db/queries';
import type { NewUser } from '$lib/db/schema';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
  const userData: NewUser = await request.json();
  const newUser = await createUser(userData);
  return json(newUser, { status: 201 });
};
```

### Type-Safe Queries
```typescript
// All queries are fully typed
const user = await getUserById(1); // User | undefined
const users = await getAllUsers(); // User[]
const newUser = await createUser({ 
  name: "John Doe", 
  email: "john@example.com" 
}); // User
```

## Configuration Notes

- **skipLibCheck**: Enabled to avoid Drizzle ORM internal type errors
- **strict**: Disabled initially for easier migration from JavaScript
- **esModuleInterop**: Enabled for better module compatibility
- Environment variables are handled through SvelteKit's `$env/static/private`

## Next Steps

1. Create and run your first migration:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

2. Use Drizzle Studio to explore your database:
   ```bash
   npm run db:studio
   ```

3. Start building type-safe database operations using the provided query functions

4. Gradually enable stricter TypeScript settings as you convert more files from JavaScript to TypeScript
