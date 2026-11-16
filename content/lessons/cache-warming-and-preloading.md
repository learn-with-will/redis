---
slug: cache-warming-and-preloading
title: Proactive Cache Warming and Preloading Strategies
topic: caching-patterns
kind: pattern
summary: Pre-populate Redis caches before peak traffic events and cold boots to prevent system-wide latency spikes.
tags:
  - cache-warming
  - preloading
  - performance
  - deployment
related:
  - cache-aside-pattern
  - cache-stampede-and-mutex-locks
  - pipelining-rtt-reduction
---
> **In one line:** Cache warming pre-populates hot data into Redis before traffic arrives, eliminating cold-start latency spikes.

## The idea

When a new cache cluster is deployed, a Redis instance restarts, or a major marketing campaign launches, the cache starts completely empty (**Cold Cache**).

If thousands of users hit an empty cache simultaneously, every single request triggers a cache miss, resulting in widespread latency spikes and overwhelming primary databases. **Cache Warming** (or *Preloading*) proactively computes and loads hot records into Redis *before* routing production user traffic to the instance.

| Approach | When Data Is Loaded | Best For | Trade-offs |
|---|---|---|---|
| **Lazy Loading (Cold Cache)** | On-demand upon first user request | Infrequently accessed data | First users experience high latency |
| **Proactive Cache Warming** | Background script runs before traffic opens | High-profile product launches, top 1000 items | Requires upfront computation and memory allocation |
| **Rolling Blue-Green Warmup** | Replicated from active cluster before switchover | Production cluster migrations | Requires secondary infrastructure during warmup |

> **Tip:** Do not attempt to warm your entire database; warm only the "Top 20%" of hot records that absorb 80% of application traffic (the Pareto principle).

## See it

Executing an asynchronous batch cache preloading script:

```bash
# 1. Warm top product categories using pipelined MSET
MSET category:1:name "Electronics" category:2:name "Books" category:3:name "Apparel"
# Returns: OK

# 2. Warm trending search keywords in a sorted set
ZADD trending:keywords 5000 "wireless headphones" 4200 "smart watch" 3100 "usb-c cable"

# 3. Attach TTL jitter to preloaded items to prevent synchronized expiration
EXPIRE category:1:name 86400
EXPIRE category:2:name 87200
EXPIRE category:3:name 85800

# 4. Verify preloaded keys exist prior to opening web traffic
EXISTS category:1:name trending:keywords
# Returns: (integer) 2 (System is warm and ready for production traffic!)
```

When web servers open incoming traffic, requests for trending keywords and categories hit RAM immediately with zero database load.

## Go deeper

Cache warming workflows should be automated in CI/CD deployment pipelines:
1. Deploy new Redis container or replica.
2. Deployment pipeline triggers a warming script that executes SQL queries for the top $N$ most popular entities.
3. Script pipelines `MSET` and `HMSET` writes into the new Redis instance.
4. Health check verifies that `used_memory` and key count match target thresholds.
5. Load balancer shifts traffic to the warm instance.

## Watch out

- Attempting to pre-warm cold, inactive historical records wastes valuable server RAM.
- Ensure the warming script uses pipelining; executing sequential single-key writes can take hours over high network latencies.

## Remember

- Cache warming preloads hot data into Redis before users arrive, preventing cold-start spikes.
- Target the top 10%–20% of most frequently requested records for preloading.
- Add randomized TTL jitter to preloaded data to avoid mass expiration waves later.
