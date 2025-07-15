import { eq } from 'drizzle-orm';
import { db, users, documents, type User, type NewUser, type Document, type NewDocument } from './index';

// User queries
export async function createUser(userData: NewUser): Promise<User> {
  const [user] = await db.insert(users).values(userData).returning();
  return user;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

export async function getAllUsers(): Promise<User[]> {
  return await db.select().from(users);
}

// Document queries
export async function createDocument(documentData: NewDocument): Promise<Document> {
  const [document] = await db.insert(documents).values(documentData).returning();
  return document;
}

export async function getDocumentById(id: number): Promise<Document | undefined> {
  const [document] = await db.select().from(documents).where(eq(documents.id, id));
  return document;
}

export async function getDocumentsByAuthor(authorId: number): Promise<Document[]> {
  return await db.select().from(documents).where(eq(documents.authorId, authorId));
}

export async function getPublishedDocuments(): Promise<Document[]> {
  return await db.select().from(documents).where(eq(documents.isPublished, true));
}

// Example of a more complex query with joins
export async function getDocumentsWithAuthors() {
  return await db
    .select({
      document: documents,
      author: users,
    })
    .from(documents)
    .leftJoin(users, eq(documents.authorId, users.id));
}
