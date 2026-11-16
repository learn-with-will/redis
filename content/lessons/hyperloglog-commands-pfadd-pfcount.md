---
slug: hyperloglog-commands-pfadd-pfcount
title: Tracking Unique Visitors with PFADD, PFCOUNT, and PFMERGE
topic: advanced-data-types
kind: api
summary: Master the HyperLogLog API using PFADD, PFCOUNT, and PFMERGE (named in honor of Philippe Flajolet).
tags:
  - hyperloglog
  - pfadd
  - pfcount
  - pfmerge
  - api
related:
  - hyperloglog-concept-cardinality
  - bitmap-analytics-bitcount-bitop
  - set-algebra-sinter-sunion-sdiff
---
> **In one line:** Add elements with `PFADD`, estimate unique counts with `PFCOUNT`, and merge daily registers with `PFMERGE`.

## The idea

The Redis HyperLogLog command family uses the prefix **`PF`** in honor of **Philippe Flajolet**, the French computer scientist who co-invented the HyperLogLog algorithm in 2007.

The API is deliberately concise, consisting of three primary operations: adding items, querying cardinality, and combining multiple independent sketches into a single merged sketch.

| Command | Arguments | Time Complexity | Return Value / Behavior |
|---|---|---|---|
| `PFADD key element [element ...]` | Key and items | $O(1)$ per element | `1` if internal registers mutated; `0` if unchanged |
| `PFCOUNT key [key ...]` | One or more keys | $O(1)$ for single key | Approximated integer unique count |
| `PFMERGE destkey srckey [...]` | Destination and sources | $O(N)$ for $N$ keys | `OK`; merges multiple HLLs into `destkey` |

> **Tip:** Calling `PFCOUNT` across multiple keys automatically computes the estimated cardinality of the union across all specified keys on-the-fly.

## See it

Tracking unique daily visitors and computing monthly active users:

```bash
# Day 1: Add visitor IP addresses
PFADD visitors:2026-11-15 "192.168.1.1" "10.0.0.5" "172.16.0.2" "192.168.1.1"
# Returns: (integer) 1

# Check Day 1 unique count (deduplication applied)
PFCOUNT visitors:2026-11-15
# Returns: (integer) 3

# Day 2: Add visitor IP addresses
PFADD visitors:2026-11-16 "10.0.0.5" "10.0.0.99" "192.168.1.50"
# Returns: (integer) 1

# Query Day 2 unique count
PFCOUNT visitors:2026-11-16
# Returns: (integer) 3

# Query total unique visitors across BOTH days on-the-fly
PFCOUNT visitors:2026-11-15 visitors:2026-11-16
# Returns: (integer) 5 (Shared IP "10.0.0.5" counted once!)

# Merge daily keys into a permanent monthly summary
PFMERGE visitors:november_total visitors:2026-11-15 visitors:2026-11-16
# Returns: OK
```

`PFMERGE` performs a register-by-register maximum merge, producing an accurate combined sketch without loss of statistical precision.

## Go deeper

Small HyperLogLogs start in a **sparse representation** consuming only a few hundred bytes. Only when elements accumulate and register entries grow does Redis convert the internal structure to the **dense representation** of exactly 12,288 bytes (12 KB).

`PFCOUNT` caches the calculated cardinality inside the HLL data structure. If no `PFADD` operations have mutated the key since the last query, `PFCOUNT` returns the cached value in constant $O(1)$ time without scanning registers.

## Watch out

- Merging dozens of HLL keys inside `PFCOUNT` creates an ephemeral temporary HLL in memory to calculate the result.
- Passing non-HLL string keys to `PFCOUNT` returns an error if the stored string is not valid HLL data.

## Remember

- HyperLogLog commands carry the `PF` prefix honoring Philippe Flajolet.
- `PFADD` updates statistical registers in $O(1)$ time.
- `PFMERGE` unions multiple independent HyperLogLog sketches into a unified aggregate.
