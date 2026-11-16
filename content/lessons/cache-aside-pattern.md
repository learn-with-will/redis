---
slug: cache-aside-pattern
title: The Cache-Aside (Lazy Loading) Pattern
topic: caching-patterns
kind: pattern
summary: Implement the classic Cache-Aside pattern where application code reads from Redis and falls back to SQL.
tags:
  - caching
  - cache-aside
  - patterns
  - lazy-loading
related:
  - write-through-and-write-behind
  - cache-stampede-and-mutex-locks
  - cache-invalidation-strategies
---
> **In one line:** In Cache-Aside, the application queries Redis first, falling back to the primary database on cache misses and repopulating the cache.

## The idea

The most widespread caching architecture in modern computing is the **Cache-Aside** (or *Lazy Loading*) pattern. The cache sits alongside the primary datastore rather than directly in front of it.

The read workflow follows three distinct steps:
1. Application queries Redis for `user:1001`.
2. **Cache Hit:** Redis returns the cached payload; the application responds in microseconds without touching the database.
3. **Cache Miss:** Redis returns `nil`. The application queries PostgreSQL/MySQL, stores the fetched result in Redis with a TTL, and returns the response to the user.

| Step | Cache Hit Flow | Cache Miss Flow |
|---|---|---|
| **1. Cache Read** | `GET user:1001` -> returns payload | `GET user:1001` -> returns `(nil)` |
| **2. Fallback DB Query** | *None (Bypassed!)* | `SELECT * FROM users WHERE id = 1001;` |
| **3. Cache Repopulation** | *None* | `SET user:1001 <payload> EX 3600` |
| **End Latency** | **< 1 millisecond** | ~15–50 milliseconds |

> **Tip:** Always attach a reasonable TTL (Time-To-Live) when populating the cache to prevent stale data from lingering forever if an invalidation event is dropped.

## See it

Simulating Cache-Aside behavior in `redis-cli`:

```bash
# Attempt to read cached user profile
GET cache:user:1001
# Returns: (nil) -> CACHE MISS!

# Application queries SQL database:
# SELECT id, name, role FROM users WHERE id = 1001;
# Fetches: Alice, admin

# Repopulate Redis cache with a 1-hour expiration (3600s)
SET cache:user:1001 '{"id":1001,"name":"Alice","role":"admin"}' EX 3600
# Returns: OK

# Subsequent user requests hit the cache instantly:
GET cache:user:1001
# Returns: (Cached JSON payload returned in 200 microseconds!)
# Returns: (integer) 3598
TTL cache:user:1001
```

Subsequent requests are served directly from RAM without placing query load onto the primary relational database.

## Go deeper

Cache-Aside provides resilience: if the Redis cache cluster goes down, the application continues functioning by querying the primary database directly (albeit with higher latency).

Furthermore, data in the cache is populated lazily on-demand. Only data that is actually requested by users consumes memory, avoiding loading inactive historical records that no user touches.

## Watch out

- Cache misses incur a penalty: the user waits for both the failed cache lookup and the subsequent database query.
- If data is updated in the SQL database without invalidating Redis, the cache serves stale records until the TTL expires.

## Remember

- Cache-Aside checks Redis first and falls back to the primary database on misses.
- Data is populated lazily on-demand, optimizing RAM utilization.
- Always attach TTL expirations to cached entries to bound stale data windows.
