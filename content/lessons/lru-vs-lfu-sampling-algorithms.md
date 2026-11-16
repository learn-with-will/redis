---
slug: lru-vs-lfu-sampling-algorithms
title: Approximated LRU and LFU Eviction via Sampling
topic: expiration-and-memory
kind: concept
summary: Redis uses high-performance probabilistic sampling to approximate true LRU and LFU eviction without memory overhead.
tags:
  - lru
  - lfu
  - sampling
  - algorithms
  - memory
related:
  - eviction-policies-overview
  - configuring-maxmemory
  - memory-diagnostics-and-usage
---
> **In one line:** Redis approximates LRU and LFU using probabilistic sampling to avoid the massive memory overhead of true doubly-linked lists.

## The idea

In computer science theory, a true **Least Recently Used (LRU)** cache maintains a global doubly-linked list. Every time an element is read or written, it is detached from its position and moved to the head of the list.

In a database holding tens of millions of keys, true LRU introduces massive overhead: every read becomes a write (mutating pointers), memory fragmentation spikes, and pointer references consume gigabytes of RAM. Redis avoids this by implementing an **approximated LRU algorithm** based on sampling.

| Eviction Engine | Metric Tracked | Algorithm Mechanism | Best Fit |
|---|---|---|---|
| **Approximated LRU** | Last access time (`lru` clock) | Samples $N$ random keys; evicts the one with oldest access | Recency-biased access patterns (bursty traffic) |
| **Approximated LFU** | Access frequency counter | Samples $N$ random keys; evicts the one with lowest frequency | Long-term popularity (frequency beats recency) |

> **Note:** Approximated LRU in Redis is so precise that sampling 10 keys achieves behavior virtually indistinguishable from true mathematical LRU while consuming zero pointer memory.

## See it

Inspecting the idle time and access frequency of keys in `redis-cli`:

```bash
# Store a key
SET product:100 "Laptop"

# Query how many seconds have elapsed since the key was last accessed (LRU idle time)
OBJECT IDLETIME product:100
# Returns: (integer) 0 (just accessed!)

# Wait 10 seconds...
OBJECT IDLETIME product:100
# Returns: (integer) 10

# Read the key to reset its idle time
GET product:100
OBJECT IDLETIME product:100
# Returns: (integer) 0

# Query the logarithmic access frequency counter under LFU
OBJECT FREQ product:100
# Returns: (integer) 1
```

Notice that reading the key (`GET`) immediately resets its `OBJECT IDLETIME` back to zero.

## Go deeper

The accuracy of approximated eviction is governed by `maxmemory-samples` in `redis.conf`:
- Default: `maxmemory-samples 5` (provides excellent efficiency with minimal CPU overhead).
- Setting `maxmemory-samples 10` approaches true LRU precision at the cost of slightly higher CPU utilization during eviction spikes.

**LFU (Least Frequently Used)** uses an 8-bit logarithmic counter embedded inside the object header, paired with a time decay factor (`lfu-decay-time`). This prevents keys that were accessed 10,000 times last month from permanently occupying memory if they are never accessed today.

## Watch out

- Setting `maxmemory-samples` above 10 increases CPU time per write without noticeable caching improvements.
- LFU counters decay over time; configure `lfu-decay-time` to match your application's traffic cycles.

## Remember

- Redis uses probabilistic random sampling to approximate LRU and LFU without pointer overhead.
- `OBJECT IDLETIME` returns the elapsed seconds since a key was last accessed.
- LFU tracks long-term popularity while decaying stale historical traffic.
