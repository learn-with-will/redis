---
slug: building-a-distributed-rate-limiter
title: Building a Distributed Rate Limiter
topic: security-and-operations
kind: technique
summary: Implement fixed-window and sliding-window distributed rate limiters using atomic counters, Sorted Sets, and Lua scripts.
tags:
  - rate-limiter
  - lua
  - sliding-window
  - patterns
related:
  - atomic-counters-incr-decr
  - range-queries-by-index-and-score
---
> **In one line:** Build robust distributed rate limiters using sliding windows in Sorted Sets or atomic fixed-window counters.

## The idea
Distributed systems require rate limiting to prevent denial-of-service, abusive scraping, and API quota exhaustion. Redis is the industry standard backend for distributed rate limiting due to its sub-millisecond atomic primitives.

There are two common algorithms implemented in Redis:
1. **Fixed Window:** Uses an atomic `INCR` and `EXPIRE`. Fast and simple, but permits traffic bursts at window boundaries (up to $2	imes$ limit).
2. **Sliding Window:** Uses a Sorted Set storing timestamps as scores. Completely eliminates window boundary bursts by measuring a rolling duration.

| Algorithm | Mechanism | Memory per User | Burst Protection |
| :--- | :--- | :--- | :--- |
| **Fixed Window** | `INCR` + `EXPIRE` | ~64 bytes | Weak (boundary spikes) |
| **Sliding Window** | `ZADD` + `ZREMRANGEBYSCORE` | ~500 bytes | Strict (smooth rolling window) |

## See it
Implement a fixed-window rate limiter using atomic `INCR`:

```bash
# Allow 100 requests per minute for API key 'apikey:prod_1'
# Step 1: Increment request counter
127.0.0.1:6379> INCR ratelimit:apikey:prod_1:1620000000
(integer) 1

# Step 2: Set expiration window on first request
127.0.0.1:6379> EXPIRE ratelimit:apikey:prod_1:1620000000 60 NX
(integer) 1
```

Implement an atomic sliding window using a Sorted Set via Lua script:

```lua
-- KEYS[1]: ratelimit key, ARGV[1]: current timestamp, ARGV[2]: window size, ARGV[3]: limit
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clear_before = now - window

-- 1. Remove timestamps older than the sliding window
redis.call('ZREMRANGEBYSCORE', key, 0, clear_before)

-- 2. Count requests in current window
local current_count = redis.call('ZCARD', key)
if current_count < limit then
    redis.call('ZADD', key, now, now)
    redis.call('EXPIRE', key, window)
    return 1 -- Allowed
else
    return 0 -- Rejected (Rate limit exceeded)
end
```

## Go deeper
The sliding-window Lua script guarantees atomic execution. In a single execution round, it purges outdated requests, counts valid requests in the current window, and appends the new timestamp if capacity remains.

Because all steps execute atomically within Redis, concurrent requests from distributed web application pods cannot race to bypass the threshold. The client receives an immediate boolean result (1 for allowed, 0 for throttled), permitting the gateway to return HTTP 429 Too Many Requests instantly.

> **Tip:** Set a TTL on the Sorted Set key (`EXPIRE key window`) so inactive user keys are cleaned up automatically by Redis without manual purging.

## Watch out
* Fixed-window rate limiters can allow a double burst (e.g. 100 requests at 11:59:59 and 100 requests at 12:00:01).
* Extremely high-throughput sliding-window keys can grow large if users issue thousands of requests per second; consider token bucket alternatives.

## Remember
* Fixed-window limiters use `INCR` and `EXPIRE` for lightweight, memory-efficient limiting.
* Sliding-window limiters use Sorted Sets with timestamps as scores to eliminate boundary burst spikes.
* Wrap sliding-window operations inside atomic Lua scripts to prevent race conditions.
