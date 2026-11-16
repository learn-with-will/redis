---
slug: cache-invalidation-strategies
title: "Cache Invalidation: TTL Jitter and Event-Driven Purging"
topic: caching-patterns
kind: pattern
summary: Master cache invalidation through event-driven deletion, key versioning, and TTL jitter to prevent synchronized expirations.
tags:
  - invalidation
  - jitter
  - event-driven
  - caching
  - patterns
related:
  - cache-aside-pattern
  - ttl-jitter-and-cache-penetration
  - cache-stampede-and-mutex-locks
---
> **In one line:** Invalidate caches explicitly upon data mutations, and add random TTL jitter to prevent synchronized mass expirations.

## The idea

As computer scientist Phil Karlton famously noted: *"There are only two hard things in Computer Science: cache invalidation and naming things."*

When data changes in your primary database, how do you prevent the cache from serving stale, obsolete records?

Modern architectures utilize two primary invalidation methodologies:
1. **Event-Driven Invalidation:** When a record is updated or deleted in the database, the backend explicitly deletes the corresponding cache key immediately.
2. **TTL Jitter (Anti-Entropy):** When setting timeouts, add a randomized time offset (jitter) so keys created at the same time do not expire at the exact same second.

| Invalidation Pattern | Mechanism | Pros | Cons |
|---|---|---|---|
| **Explicit Deletion** | `DEL cache:user:1001` on update | Instant freshness; no stale reads | Requires updating code in every write path |
| **TTL Expiration Only** | Waits for TTL to count down | Simple; zero invalidation code | Data remains stale for duration of TTL |
| **TTL with Random Jitter** | `TTL = base_time + rand(1..300)` | Prevents thundering herds on mass cache loads | Slight variation in cache lifetimes |
| **Key Versioning** | Store version in separate key | Instant invalidation of entire collections | Two reads per item |

> **Tip:** Always **delete** the cache key upon update rather than setting the new value. Deleting prevents race conditions between concurrent database writes.

## See it

Applying TTL jitter and explicit invalidation in `redis-cli`:

```bash
# BAD: Setting 1,000 keys with exact 3600-second TTL
# All 1,000 keys expire at the exact same millisecond 1 hour later!
# SET user:1 <data> EX 3600
# SET user:2 <data> EX 3600

# GOOD: Add random jitter (+/- 10% randomization)
# In application code: ttl = 3600 + random_int(-300, 300)
SET user:1 <data> EX 3482
SET user:2 <data> EX 3715
SET user:3 <data> EX 3591

# Explicit Invalidation upon Database Mutation:
# User 2 changes their password in PostgreSQL:
# UPDATE users SET password_hash = '...' WHERE id = 2;
# Immediately purge cached user state from Redis:
DEL user:2
# Returns: (integer) 1
```

Adding random jitter spreads expiration events smoothly across a 10-minute window rather than concentrating them in a single destructive second.

## Go deeper

**Key Versioning Pattern:**
To invalidate an entire collection (e.g., all cached articles for user 42) without deleting thousands of individual keys:
1. Maintain a version counter: `SET user:42:version 1`.
2. Construct item keys including the version: `GET user:42:v1:article:101`.
3. To invalidate all user 42's cached articles at once, simply increment the version: `INCR user:42:version`.
4. Subsequent lookups query `user:42:v2:article:101`, causing automatic cache misses across all old items!

## Watch out

- Updating the cache with `SET` during database writes introduces lost updates if transactions commit out of order; always `DEL` instead.
- If event-driven invalidation drops a message, stale data persists until the fallback TTL elapses.

## Remember

- Always delete cache keys upon database updates rather than attempting to update them in-place.
- Add randomized TTL jitter (e.g., $\pm 10\%$) to prevent synchronized mass expiration storms.
- Key versioning allows instant invalidation of entire collections by incrementing a version counter.
