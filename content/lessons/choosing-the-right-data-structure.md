---
slug: choosing-the-right-data-structure
title: Choosing the Right Data Structure
topic: security-and-operations
kind: pattern
summary: Select optimal Redis data types by matching access patterns, memory efficiency, ordering needs, and algorithmic complexity.
tags:
  - data-modeling
  - architecture
  - patterns
  - best-practices
related:
  - string-type-and-binary-safety
  - hash-structure-and-field-values
---
> **In one line:** Selecting the optimal Redis data structure depends on access patterns: uniqueness, ordering, field updates, or cardinality.

## The idea
The strength of Redis lies in its rich variety of specialized data structures. A common pitfall among newcomers is using Strings to serialize everything as JSON blobs, discarding Redis's native atomic data structures.

Choosing the right data structure reduces memory consumption by up to 80% and unlocks sub-millisecond atomic queries.

| Data Structure | Best Used For | Key Strengths | Time Complexity |
| :--- | :--- | :--- | :--- |
| **String** | Caching, counters, tokens, binary blobs | Fast atomic INCR, low overhead | $O(1)$ |
| **Hash** | User profiles, entity records, sessions | Partial field updates, memory compact | $O(1)$ per field |
| **List** | Job queues, capped activity streams | Fast push/pop at ends, blocking pops | $O(1)$ at head/tail |
| **Set** | Tags, unique visitors, mutual friends | Fast uniqueness, intersections ($O(N)$) | $O(1)$ lookup |
| **Sorted Set** | Leaderboards, rate limiters, priority queues | Range queries by score or rank | $O(\log N)$ |
| **Stream** | Event logging, event-driven pipelines | Consumer groups, acknowledged delivery | $O(1)$ append |

## See it
Compare modeling an entity as a JSON string vs. a native Hash:

```bash
# Anti-pattern: String JSON requires deserializing entire object for 1 change
127.0.0.1:6379> SET user:100 '{"name":"Alice","login_count":5,"email":"a@b.com"}'
OK
# Updating login count requires client round-trip: GET -> Parse -> Increment -> SET

# Best Practice: Native Hash allows instant atomic in-place updates
127.0.0.1:6379> HSET user:100 name "Alice" login_count 5 email "a@b.com"
(integer) 3
127.0.0.1:6379> HINCRBY user:100 login_count 1
(integer) 6

# Query specific field with zero JSON parsing overhead
127.0.0.1:6379> HGET user:100 login_count
"6"
```

## Go deeper
When modeling data, consider three primary dimensions:
1. **Mutation Granularity:** Do you need to update individual fields independently? (Choose Hash).
2. **Cardinality & Uniqueness:** Do you need unique membership? (Choose Set or Sorted Set).
3. **Ordering:** Do you need insertion order (List), score/priority order (Sorted Set), or time-series ordering (Stream)?

Furthermore, consider memory encoding optimizations. Small Hashes, Sets, and Sorted Sets utilize memory-efficient compact encodings (like `listpack`) rather than full pointer-heavy hashtables or skiplists. This allows thousands of micro-records to fit into a fraction of the RAM consumed by plain string keys.

> **Tip:** Hashes configured with fewer than 128 fields are stored using memory-compact `listpack` representations, using a fraction of the RAM required by raw Strings.

## Watch out
* Avoid using Lists as random-access arrays; indexing elements by `LINDEX` or `LSET` takes $O(N)$ time.
* Do not store millions of items in a single key; partition large sets or hashes into bucketed keys.

## Remember
* Match your data structure to your access patterns: uniqueness, ordering, or partial mutations.
* Prefer native Hashes over serialized JSON Strings when updating individual entity attributes.
* Use Sets for relationships and Sorted Sets for leaderboards and sliding-window rate limiters.
