---
slug: eviction-policies-overview
title: Understanding the Eight Redis Eviction Policies
topic: expiration-and-memory
kind: concept
summary: Master the eight eviction policies to control how Redis reclaims memory when maxmemory limits are reached.
tags:
  - eviction
  - maxmemory-policy
  - lru
  - lfu
  - memory
related:
  - configuring-maxmemory
  - lru-vs-lfu-sampling-algorithms
  - cache-aside-pattern
---
> **In one line:** Configure `maxmemory-policy` to govern whether Redis evicts least-recently-used, least-frequently-used, or expiring keys when full.

## The idea

When database memory consumption hits `maxmemory`, Redis must decide what to do with incoming writes. Should it refuse new writes with an error? Should it delete keys with the shortest remaining TTL? Or should it evict the least-recently-used items?

Redis provides **eight distinct eviction policies** configured via `maxmemory-policy` in `redis.conf`.

| Eviction Policy | Keys Targeted | Algorithm Used | Best For |
|---|---|---|---|
| **`noeviction`** (Default) | None | No eviction; writes return OOM errors | Primary databases where data loss is unacceptable |
| **`allkeys-lru`** | All keys | Approximated Least Recently Used (LRU) | Pure caching layers; keeps hot items in memory |
| **`volatile-lru`** | Keys with a TTL | Approximated Least Recently Used (LRU) | Mixed workloads (cache + permanent config keys) |
| **`allkeys-lfu`** | All keys | Approximated Least Frequently Used (LFU) | Caching where access frequency matters more than recency |
| **`volatile-lfu`** | Keys with a TTL | Approximated Least Frequently Used (LFU) | Mixed workloads prioritizing frequent keys |
| **`volatile-ttl`** | Keys with a TTL | Shortest remaining TTL evicted first | Caches where nearest deadlines should be purged |
| **`allkeys-random`** | All keys | Purely random key eviction | Uniform key access distributions |
| **`volatile-random`** | Keys with a TTL | Purely random among keys with TTL | Rare specialized applications |

> **Note:** The default policy is `noeviction`. Under `noeviction`, Redis will never delete your data silently, but writes will fail when the memory ceiling is reached.

## See it

Inspecting and switching eviction policies in `redis-cli`:

```bash
# Check the active eviction policy
CONFIG GET maxmemory-policy
# Returns:
# 1) "maxmemory-policy"
# 2) "noeviction"

# Switch to allkeys-lru for a pure application caching workload
CONFIG SET maxmemory-policy allkeys-lru
# Returns: OK

# Verify the policy change
CONFIG GET maxmemory-policy
# Returns:
# 1) "maxmemory-policy"
# 2) "allkeys-lru"
```

With `allkeys-lru` active, whenever memory reaches `maxmemory`, Redis automatically frees the least recently accessed keys to accommodate incoming writes.

## Go deeper

Choosing between **`allkeys-lru`** and **`volatile-lru`** depends entirely on your database usage:
- If Redis is used **purely as a cache** where every stored key can be recreated from a database, choose `allkeys-lru`.
- If Redis holds **mixed data**—such as permanent application settings without TTLs alongside temporary cache keys with TTLs—choose `volatile-lru` so permanent keys are never deleted.

## Watch out

- Using `volatile-lru` when few or no keys have a TTL behaves exactly like `noeviction`, returning OOM write errors.
- Never choose `allkeys-lru` if Redis acts as your primary database; you will silently lose persistent records.

## Remember

- The default policy `noeviction` rejects writes with OOM errors when memory is full.
- Use `allkeys-lru` for dedicated web caches to keep hot items active in memory.
- Use `volatile-lru` or `volatile-lfu` for mixed workloads to protect permanent keys.
