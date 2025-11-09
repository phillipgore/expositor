# Database Seed Data

This directory contains scripts for creating and restoring test data snapshots for your database.

## Overview

The seed data system allows you to:
1. **Export** a snapshot of your current database data (study groups, studies, and passages)
2. **Restore** that snapshot whenever you need to reset your database to a known state

## Files

- **`export-seed-data.ts`** - Script that queries your database and generates the SQL file
- **`seed-data.sql`** - Generated SQL file containing your data snapshot (DELETE + INSERT statements)

## Usage

### 1. Create a Snapshot (Export Current Data)

Run this command to capture your current database state:

```bash
npm run db:export-seed
```

This will:
- Connect to your database
- Query all data from `study_group`, `study`, and `passage` tables
- Generate `scripts/seed-data.sql` with SQL statements to recreate this exact data

### 2. Restore the Snapshot (Reset Database)

When you want to reset your database to the captured state, **manually** run the SQL file:

```bash
psql $DATABASE_URL -f scripts/seed-data.sql
```

Or if you prefer to specify the connection details:

```bash
psql -h hostname -U username -d database_name -f scripts/seed-data.sql
```

## What Data is Included?

The seed data includes:
- ✅ Study groups (including nested groups)
- ✅ Studies
- ✅ Passages

The seed data does **NOT** include:
- ❌ User accounts
- ❌ Sessions
- ❌ Authentication data
- ❌ Verification tokens

## Safety Features

- **Manual Execution**: The SQL file must be manually run - there's no automatic restore command. This prevents accidental data loss.
- **Clear SQL**: The generated SQL is human-readable so you can review exactly what will happen before running it.
- **Proper Ordering**: The script respects foreign key constraints (deletes passages → studies → study groups in the correct order).

## Example Workflow

```bash
# 1. Set up your database with the data you want to preserve
# (Create study groups, studies, passages through the app)

# 2. Export the current state
npm run db:export-seed

# 3. Work on your app, test features, make changes...

# 4. Reset to the original state when needed
psql $DATABASE_URL -f scripts/seed-data.sql

# 5. Your database is now back to the exact state from step 2!
```

## Generated SQL Structure

The `seed-data.sql` file contains:

1. **Header** - Timestamp and instructions
2. **Safety Settings** - Temporarily disables triggers
3. **DELETE Statements** - Removes all existing data from the three tables
4. **INSERT Statements** - Restores your snapshot data
5. **Re-enable Settings** - Re-enables triggers

## Notes

- The SQL file is generated each time you run `npm run db:export-seed` (overwrites previous version)
- Consider committing `seed-data.sql` to version control if you want to share the baseline data with your team
- The snapshot captures the exact state at the time of export, including all IDs and relationships
