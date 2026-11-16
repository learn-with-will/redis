---
slug: passive-vs-active-expiration
title: "How Key Expiration Works: Passive Access and Active Sampling"
topic: expiration-and-memory
kind: concept
summary: "Redis purges expired keys through two complementary mechanisms: passive on-access checks and active probabilistic sampling."
tags:
  - internals
  - expiration
  - passive
  - active
  - memory
related:
  - expire-and-ttl-basics
  - configuring-maxmemory
  - eviction-policies-overview
---
> **In one line:** Redis purges expired keys using passive on-access checks combined with active background probabilistic sampling.

## The idea

A common misconception is that Redis maintains an individual operating system timer for every expired key that fires precisely when its TTL hits zero. If Redis maintained individual hardware timers for 50 million keys, CPU scheduling overhead would halt command processing.

Instead, Redis uses a dual strategy to reclaim memory from expired keys: **passive expiration** and **active expiration**.

| Expiration Strategy | Trigger | Mechanism | CPU Impact |
|---|---|---|---|
| **Passive Expiration** | Client reads key (`GET`, `HGET`, etc.) | Key is checked; if expired, deleted immediately before replying | Zero background overhead; only checked when requested |
| **Active Expiration** | 10 times per second (server cron) | Samples 20 random keys with TTLs; purges expired ones | Bounded to <= 25% of CPU time per cycle |

> **Note:** Because active expiration is probabilistic, expired keys that are never read again may linger in memory until picked up by the random sampling cycle or eviction policies.

## See it

Simulating passive expiration behavior during client reads:

```bash
# Set a key to expire in 2 seconds
SET temp:token "secret" EX 2

# Immediately query the key (still alive)
GET temp:token
# Returns: "secret"

# Wait 3 seconds for the TTL to elapse...
# Client reads the key again:
GET temp:token
# Returns: (nil)
```

When the second `GET` arrived, Redis checked the key's internal timestamp, identified that the TTL had expired, deleted the key from RAM, and returned `(nil)` to the client.

## Go deeper

The **Active Expiration Cycle** runs 10 times per second (`hz 10` in `redis.conf`) through the following routine:
1. Sample **20 random keys** from the dictionary of keys with an expiration.
2. Delete all keys in the sample that have expired.
3. If more than **25%** (5 keys) of the sample were expired, immediately repeat the cycle from Step 1.
4. If less than 25% were expired, conclude the cycle and wait for the next cron tick.

This algorithm bounds memory waste: probabilistically, the percentage of expired keys in memory rarely exceeds 25% of all keys with a TTL.

## Watch out

- If millions of keys expire at the exact same second, active sampling loops aggressively, consuming up to 25% of single-threaded CPU time.
- Replicas in a primary-replica cluster do not expire keys independently; they wait for the primary to send an explicit `DEL` command.

## Remember

- Passive expiration deletes expired keys when clients attempt to read them.
- Active expiration probabilistically samples and purges 20 keys 10 times per second.
- To prevent CPU spikes, randomize TTL expirations by adding random jitter to expiration values.
