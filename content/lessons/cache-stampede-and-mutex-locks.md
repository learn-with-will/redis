---
slug: cache-stampede-and-mutex-locks
title: Mitigating Cache Stampedes and Thundering Herds
topic: caching-patterns
kind: technique
summary: Prevent cache stampedes when hot keys expire by acquiring distributed mutex locks with SET NX EX.
tags:
  - stampede
  - thundering-herd
  - mutex
  - locking
  - caching
related:
  - cache-aside-pattern
  - set-options-nx-xx-get
  - ttl-jitter-and-cache-penetration
---
> **In one line:** Prevent cache stampedes on hot key expiration by acquiring a distributed mutex lock with `SET NX EX` so only one worker queries the database.

## The idea

In high-traffic applications, a hot cache key (such as the homepage product catalog or trending news list) might be queried 10,000 times per second.

When that hot key's TTL expires, all 10,000 concurrent requests suddenly experience a cache miss simultaneously. Every single worker thread attempts to query the primary SQL database and re-calculate the payload at the exact same moment. This phenomenon is known as a **Cache Stampede** (or **Thundering Herd** problem), and it routinely crashes backend databases.

| Stage | Without Stampede Protection | With Distributed Mutex Lock (`SET NX EX`) |
|---|---|---|
| **Hot Key Expires** | 10,000 concurrent cache misses | 10,000 concurrent cache misses |
| **Database Query** | **10,000 parallel SQL queries hit database** | **Exactly 1 worker acquires lock** and queries DB |
| **Other 9,999 Workers** | Wait on database locks; DB crashes | Wait 50ms or return stale data; read new cache upon arrival |
| **System Impact** | Outage / cascading failure | Clean, sub-millisecond recovery |

> **Tip:** Using `SET lock:key token EX 10 NX` guarantees that exactly one worker acquires permission to refresh the cache.

## See it

Implementing a mutex-guarded cache refresh in `redis-cli`:

```bash
# 1. Worker A encounters a cache miss on "cache:homepage"
GET cache:homepage
# Returns: (nil)

# 2. Worker A attempts to acquire the rebuild lock (expires in 10s to prevent deadlock)
SET lock:cache:homepage "worker_A_uuid" EX 10 NX
# Returns: OK (Worker A won the right to rebuild!)

# 3. Simultaneous Worker B encounters the same miss and attempts to acquire the lock:
SET lock:cache:homepage "worker_B_uuid" EX 10 NX
# Returns: (nil) (Worker B failed to acquire lock!)

# 4. Worker B sleeps 50ms, then retries reading the cache:
# GET cache:homepage

# 5. Worker A finishes SQL query, repopulates cache, and releases lock:
SET cache:homepage '{"items":["phone","laptop"]}' EX 3600
DEL lock:cache:homepage
```

Worker B waited briefly and consumed the newly generated cache entry without ever touching the primary database.

## Go deeper

An alternative algorithmic solution to cache stampedes is **Probabilistic Early Recomputation (XFetch algorithm)**:
- Instead of waiting for the key to expire at $TTL = 0$, workers compute a probability based on remaining TTL and computation time:
$$\Delta 	imes eta 	imes \ln(	ext{random}()) > 	ext{remaining\_TTL}$$
- As the deadline approaches, a worker probabilistically triggers a background refresh *before* the key expires, ensuring the key is never observed as expired.

## Watch out

- Always specify an expiration (`EX`) when acquiring mutex locks; if the worker crashes mid-query without a TTL, the lock deadlocks forever.
- Always use a unique token (UUID) when setting the lock to prevent one worker from accidentally deleting another worker's lock.

## Remember

- Cache stampedes occur when hot keys expire and thousands of workers overwhelm the database.
- Use `SET lock:key token EX 10 NX` to elect a single worker to refresh the cache.
- The XFetch algorithm provides probabilistic early recomputation before expiration occurs.
