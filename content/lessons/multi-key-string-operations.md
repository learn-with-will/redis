---
slug: multi-key-string-operations
title: "Multi-Key Operations: MSET, MGET, and MSETNX"
topic: keys-and-strings
kind: api
summary: Eliminate network latency round-trips by reading and writing multiple string keys at once with MSET and MGET.
tags:
  - mset
  - mget
  - batching
  - strings
related:
  - string-type-and-binary-safety
  - pipelining-rtt-reduction
  - hash-tags-multi-key-operations
---
> **In one line:** `MSET` and `MGET` batch reads and writes across multiple string keys in a single network round-trip.

## The idea

When an application needs to fetch 50 separate configuration settings or user attributes, issuing 50 sequential `GET` commands incurs 50 round-trip network hops (RTT). If each network round-trip takes 1 millisecond, the total operation consumes 50 milliseconds—even though Redis spent less than 50 microseconds executing the queries.

Multi-key string commands allow clients to bundle reads and writes into a single request, drastically boosting application throughput.

| Command | Arguments | Time Complexity | Atomicity / Behavior |
|---|---|---|---|
| `MGET key [key ...]` | One or more keys | $O(N)$ for $N$ keys | Returns array of values in matching order; missing keys return `nil` |
| `MSET key val [key val ...]` | One or more key-value pairs | $O(N)$ | Atomic; all keys are set simultaneously |
| `MSETNX key val [key val ...]` | One or more key-value pairs | $O(N)$ | Atomic; sets all keys **only if none** of the keys exist |

> **Tip:** `MSET` is completely atomic: all keys are updated at once, and no client can observe a state where only half the keys have been written.

## See it

Batching multiple reads and writes in `redis-cli`:

```bash
# Write three keys simultaneously
MSET user:1:name "Alice" user:2:name "Bob" user:3:name "Charlie"
# Returns: OK

# Read all three keys plus a non-existent key in one call
MGET user:1:name user:2:name user:99:name user:3:name
# Returns:
# 1) "Alice"
# 2) "Bob"
# 3) (nil)
# 4) "Charlie"

# Conditional all-or-nothing multi-write
MSETNX user:3:name "Chuck" user:4:name "David"
# Returns: (integer) 0 (Failed because user:3:name already exists!)
```

`MSETNX` will not set `user:4:name` because `user:3:name` already exists, preserving strict all-or-nothing transactional semantics.

## Go deeper

While `MSET` is fast, passing tens of thousands of keys in a single invocation can freeze the single-threaded Redis core while the server parses the network buffer and updates keyspace dictionaries.

In **Redis Cluster**, multi-key operations (`MGET`, `MSET`, `MSETNX`) are strictly restricted: all keys queried in a single command **must reside in the same hash slot**. To use `MSET` in a clustered environment, you must enforce slot placement using hash tags (e.g., `{tenant:100}:key1` and `{tenant:100}:key2`).

## Watch out

- In Redis Cluster, multi-key commands error with `CROSSSLOT` if keys belong to different hash slots.
- Do not pass millions of keys in a single `MSET`; chunk large batches into groups of 500 to 1,000 keys.

## Remember

- `MSET` and `MGET` eliminate round-trip network latency by bundling operations.
- `MSET` is fully atomic; all keys update simultaneously without interleaving.
- In Redis Cluster, all keys in a multi-key command must belong to the same hash slot.
