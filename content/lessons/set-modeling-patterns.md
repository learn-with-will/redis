---
slug: set-modeling-patterns
title: Tagging and Relationship Modeling with Sets
topic: sets-and-sorted-sets
kind: pattern
summary: Model many-to-many relationships, content tags, and inverted indexes using Redis Sets and set algebra.
tags:
  - modeling
  - tags
  - relationships
  - patterns
related:
  - set-data-structure-basics
  - set-algebra-sinter-sunion-sdiff
  - building-leaderboards
---
> **In one line:** Use two-way Redis Sets to model many-to-many relationships like article tags, user followers, and inverted indexes.

## The idea

Relational databases model many-to-many relationships using intermediate join tables (e.g., `article_tags`). Querying articles that match multiple tags requires multi-table SQL `JOIN` statements and sub-queries that grow expensive at scale.

In Redis, many-to-many relationships are modeled by maintaining two complementary sets:
1. **Forward Mapping:** Entity to its associated tags (e.g., `article:101:tags`).
2. **Reverse Mapping (Inverted Index):** Tag to the entities containing it (e.g., `tag:database:articles`).

| Direction | Redis Set Key | Members Stored | Query Answered |
|---|---|---|---|
| **Forward** | `user:101:following` | IDs of followed users | "Who does user 101 follow?" |
| **Reverse** | `user:202:followers` | IDs of following users | "Who follows user 202?" |
| **Index** | `tag:redis:articles` | IDs of tagged articles | "Which articles are tagged with 'redis'?" |

> **Tip:** Always update both forward and reverse sets inside a `MULTI`/`EXEC` transaction to keep references synchronized.

## See it

Implementing a real-time article tagging and multi-tag search system:

```bash
# Tag article 101 with 'redis' and 'backend'
SADD article:101:tags "redis" "backend"
SADD tag:redis:articles "101"
SADD tag:backend:articles "101"

# Tag article 102 with 'redis' and 'frontend'
SADD article:102:tags "redis" "frontend"
SADD tag:redis:articles "102"
SADD tag:frontend:articles "102"

# Query: Find all articles that have BOTH 'redis' AND 'backend' tags
SINTER tag:redis:articles tag:backend:articles
# Returns:
# 1) "101"

# Query: What tags does article 102 have?
SMEMBERS article:102:tags
# Returns:
# 1) "redis"
# 2) "frontend"
```

Intersecting tag sets allows instant multi-filter search queries that execute in sub-millisecond time.

## Go deeper

When an entity is deleted, your application must clean up both the forward set and the corresponding references inside each reverse index set:

```bash
# Deleting article 101:
# Step 1: Read all tags associated with article 101
SMEMBERS article:101:tags

# Step 2: In a transaction, remove article 101 from each inverted index
SREM tag:redis:articles "101"
SREM tag:backend:articles "101"
DEL article:101:tags
```

This bidirectional pattern powers social network follower graphs, permission access control matrices, and catalog filtering systems across top web applications.

## Watch out

- Failing to remove references from reverse sets creates dangling orphaned IDs in your index.
- Highly popular tags (e.g., `tag:news:articles`) can become hot keys with millions of members; paginate them using `SSCAN`.

## Remember

- Maintain forward and reverse sets to model many-to-many relationships cleanly.
- Inverted tag indexes enable instant multi-criteria filtering via `SINTER`.
- Bundle updates to complementary sets inside transactions to prevent index drift.
