---
slug: hyperloglog-concept-cardinality
title: Probabilistic Cardinality Counting with HyperLogLog
topic: advanced-data-types
kind: concept
summary: Count billions of unique items with 12KB fixed memory using HyperLogLog and an acceptable 0.81% standard error.
tags:
  - hyperloglog
  - probabilistic
  - cardinality
  - analytics
related:
  - hyperloglog-commands-pfadd-pfcount
  - bitmaps-per-bit-flags
  - set-data-structure-basics
---
> **In one line:** HyperLogLog estimates the unique cardinality of billions of items using a fixed 12 KB memory footprint with a 0.81% standard error.

## The idea

Counting unique visitors, search queries, or IP addresses is an essential requirement for analytics systems. When using standard Sets, memory scales linearly: tracking 100 million unique strings (such as IP addresses or search terms) consumes gigabytes of server RAM.

A **HyperLogLog (HLL)** is a probabilistic data structure that estimates the **cardinality** (count of unique items) of a set without storing the actual elements. Regardless of whether you observe 1,000 unique items or 100 billion unique items, a Redis HyperLogLog consumes a maximum of **12 kilobytes of memory** per key with a standard error of **0.81%**.

| Measurement Dimension | Exact Sets (`SCARD`) | Probabilistic HyperLogLog (`PFCOUNT`) |
|---|---|---|
| **Memory per Key** | Scales linearly ($O(N)$); up to gigabytes | Fixed maximum of **12 KB** ($O(1)$) |
| **Accuracy** | 100% exact count | Approximated with **0.81% standard error** |
| **Member Retrieval** | Yes (`SMEMBERS` returns all items) | **No** (items are hashed; raw items cannot be retrieved) |
| **Scale Limit** | Bounded by physical RAM | Up to $2^{64}$ unique items |

> **Note:** HyperLogLog is a one-way statistical summary; you can query the estimated count of unique items, but you cannot retrieve the original members or check if a specific item was added.

## See it

Comparing exact sets and HyperLogLog memory footprints in `redis-cli`:

```bash
# Add 3 elements to an exact set (stores full strings)
SADD exact_users "user_alice" "user_bob" "user_charlie"
SCARD exact_users
# Returns: (integer) 3

# Add 3 elements to a HyperLogLog (stores only statistical bit patterns)
PFADD hll_users "user_alice" "user_bob" "user_charlie"
PFCOUNT hll_users
# Returns: (integer) 3

# Check memory footprint comparison
MEMORY USAGE exact_users
# Returns: ~200 bytes

MEMORY USAGE hll_users
# Returns: ~200 bytes (starts sparse, capped at 12 KB when full)
```

At massive scale, storing 100 million members in a set requires 4 gigabytes of memory, whereas HyperLogLog holds the estimate in strictly 12 kilobytes of RAM. For analytics dashboards, ad impressions, and search volume estimation, a 0.81% variance is an exceptional trade-off for a 99.99% reduction in memory consumption.

## Go deeper

HyperLogLog works by hashing each inserted element with a 64-bit hash function and observing the distribution of leading zeros in the binary hash output.

Think of flipping a coin: observing 10 consecutive "heads" suggests that many flips have occurred. HyperLogLog divides incoming hashes across **16,384 internal registers** (buckets), tracking maximum leading zero counts in each bucket. The harmonic mean across registers estimates total cardinality while filtering out statistical anomalies.

## Watch out

- Never use HyperLogLog if your application requires retrieving the actual members; HLL does not store raw values.
- Do not use HyperLogLog for small counts where exact numbers are legally required (such as billing or financial auditing).

## Remember

- HyperLogLog estimates unique counts using a fixed maximum of 12 KB RAM.
- Delivers a reliable 0.81% standard error rate across billions of unique items.
- Ideal for high-volume analytics where statistical approximations are acceptable.
