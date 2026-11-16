---
slug: write-through-and-write-behind
title: Write-Through and Write-Behind Caching Strategies
topic: caching-patterns
kind: pattern
summary: Compare synchronous Write-Through caching with asynchronous Write-Behind batching for high-throughput write workloads.
tags:
  - write-through
  - write-behind
  - caching
  - patterns
related:
  - cache-aside-pattern
  - cache-invalidation-strategies
  - distributed-locking-tradeoffs
---
> **In one line:** Write-Through synchronously writes to both cache and database, while Write-Behind buffers writes in Redis for async persistence.

## The idea

While Cache-Aside focuses on read acceleration, write patterns govern how mutations are synchronized between Redis and the underlying database.

Two fundamental write strategies address varying performance and consistency requirements:
1. **Write-Through:** The application or caching proxy writes data simultaneously to both the cache and the primary database before confirming success to the client.
2. **Write-Behind (Write-Back):** The application writes data *only* to Redis and immediately confirms success to the client. A background worker periodically drains mutations from Redis and batches them to the primary database asynchronously.

| Dimension | Cache-Aside | Write-Through | Write-Behind (Write-Back) |
|---|---|---|---|
| **Write Target** | Database first; invalidates cache | Cache and Database synchronously | **Redis only**; DB updated asynchronously |
| **Write Latency** | Milliseconds (bounded by DB) | Milliseconds (DB write + cache write) | **Microseconds** (sub-millisecond in-memory write) |
| **Crash Risk** | Low (DB updated first) | Low (both written in sync) | **Medium** (writes buffered in Redis before DB flush) |
| **Write Deduplication** | None | None | **High** (100 updates to a row flushed as 1 SQL query) |

> **Note:** Write-Behind is widely adopted in gaming telemetry, analytics counters, and IoT tracking where write volumes would crush a relational database.

## See it

Implementing a Write-Behind buffer queue in `redis-cli`:

```bash
# 1. High-frequency user activity arrives; write directly to Redis in microseconds
HSET user:1001:stats page_views 45 clicks 12 last_active 1763321400

# 2. Add the dirty user ID to a background flush queue
SADD dirty:users "1001"
# Returns: (integer) 1

# 3. Repeat for another user
HSET user:1002:stats page_views 10 clicks 2 last_active 1763321405
SADD dirty:users "1002"

# 4. Asynchronous Background Worker runs every 30 seconds:
# Pops dirty users in batches
SPOP dirty:users 50
# Returns: "1001", "1002"

# Worker reads current aggregated stats from Redis and flushes 1 batch SQL UPDATE to Postgres!
HGETALL user:1001:stats
```

Instead of executing 100 individual SQL `UPDATE` statements, the worker flushes a single coalesced update, drastically reducing database load.

## Go deeper

Write-Through eliminates stale reads because the cache always mirrors the newly committed database row. However, writing to keys that are never read wastes memory.

Write-Behind absorbs massive write spikes (such as flash sales or viral vote counting), deduplicating mutations in memory before committing to disk. However, if the Redis instance crashes before the background worker flushes the queue, unpersisted writes can be lost unless AOF persistence is tuned to `appendfsync everysec`.

## Watch out

- In Write-Behind, a server crash before flushing to the database results in permanent data loss.
- In Write-Through, write latency is always bounded by the slowest datastore (the disk-based database).

## Remember

- Write-Through guarantees cache-database consistency by writing to both stores synchronously.
- Write-Behind delivers sub-millisecond write responses by buffering mutations in Redis.
- Write-Behind coalesces multiple rapid writes into a single batched database transaction.
