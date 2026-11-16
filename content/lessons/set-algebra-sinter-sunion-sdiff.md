---
slug: set-algebra-sinter-sunion-sdiff
title: "Set Algebra: Intersections, Unions, and Differences"
topic: sets-and-sorted-sets
kind: technique
summary: Compute complex relations directly on the server with SINTER, SUNION, and SDIFF without client-side data transfer.
tags:
  - sets
  - sinter
  - sunion
  - sdiff
  - algebra
related:
  - set-data-structure-basics
  - set-modeling-patterns
  - sorted-sets-scores-and-ordering
---
> **In one line:** Perform server-side set algebra with `SINTER` (intersection), `SUNION` (union), and `SDIFF` (difference).

## The idea

A standout capability of Redis is its ability to perform high-level set mathematics directly in server memory. Rather than transferring multiple large lists over the network to calculate common items in application code, Redis computes intersections, unions, and differences in microseconds.

This makes Redis exceptionally well-suited for social graphs, matching algorithms, audience segmentation, and multi-tag filtering.

| Mathematical Operation | Redis Command | Meaning | Practical Example |
|---|---|---|---|
| **Intersection** | `SINTER key [key ...]` | Elements present in **all** sets | Mutual friends between two users |
| **Union** | `SUNION key [key ...]` | Elements present in **any** set | All skills possessed by team members |
| **Difference** | `SDIFF key [key ...]` | Elements in first set but **not** in others | Users who signed up but never activated |
| **Store Result** | `SINTERSTORE dst key ...` | Computes intersection and stores in `dst` | Caching pre-computed audience lists |

> **Tip:** Redis 7.0 introduced `SINTERCARD`, which returns only the *cardinality* (count) of an intersection without allocating or transferring the actual element array.

## See it

Computing mutual friends and missing onboarding steps:

```bash
# Define friend circles for Alice and Bob
SADD friends:alice "charlie" "david" "elena" "frank"
SADD friends:bob "david" "elena" "george" "hannah"

# Find mutual friends (Intersection)
SINTER friends:alice friends:bob
# Returns:
# 1) "david"
# 2) "elena"

# Find friends Alice has that Bob does not (Difference)
SDIFF friends:alice friends:bob
# Returns:
# 1) "charlie"
# 2) "frank"

# Find total combined network (Union)
SUNION friends:alice friends:bob

# Store mutual friends into a new key for caching
SINTERSTORE friends:mutual:alice:bob friends:alice friends:bob
# Returns: (integer) 2
```

Notice how `SINTERSTORE` stores the resulting set directly on the server, avoiding any data round-trip to the application client.

## Go deeper

The time complexity of `SINTER` is $O(N 	imes M)$ where $N$ is the cardinality of the *smallest* set and $M$ is the number of sets being intersected. Redis optimizes this algorithm by sorting input keys by size and iterating through the smallest set first, checking membership in the remaining sets.

If you only need to know how many items intersect (e.g., "Do Alice and Bob have at least 5 mutual friends?"), use `SINTERCARD 2 friends:alice friends:bob LIMIT 5`.

## Watch out

- Running `SUNION` or `SDIFF` across massive sets consumes significant CPU time on the single-threaded core.
- In Redis Cluster, all keys passed to `SINTER`, `SUNION`, or `SDIFF` must belong to the exact same hash slot (use hash tags `{...}`).

## Remember

- `SINTER` finds common members across multiple sets.
- `SUNION` merges all members into a single deduplicated view.
- `SDIFF` subtracts subsequent sets from the first set.
