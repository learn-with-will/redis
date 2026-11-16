---
slug: sorted-sets-scores-and-ordering
title: "Sorted Sets: Scores, Ordering, and Skip Lists"
topic: sets-and-sorted-sets
kind: concept
summary: Sorted Sets map unique string members to floating-point scores, maintaining continuous sort order via Skip Lists.
tags:
  - sorted-sets
  - zset
  - scores
  - skiplist
related:
  - zadd-and-score-updates
  - range-queries-by-index-and-score
  - building-leaderboards
---
> **In one line:** A Redis Sorted Set couples unique string members with floating-point scores, maintaining continuous sorted order.

## The idea

A **Sorted Set** (or `zset`) is arguably the most sophisticated data structure in Redis. Like a standard Set, every member must be unique. However, every member is paired with a numeric 64-bit IEEE 754 floating-point **score**.

Redis keeps members continuously sorted by their score. Whenever a member is inserted or its score is updated, Redis repositions it in $O(\log N)$ time. You can instantly retrieve the highest-ranking members, count members within score ranges, or determine an element's exact percentile rank.

| Characteristic | Standard Set (`set`) | Sorted Set (`zset`) |
|---|---|---|
| **Uniqueness** | Unique string members | Unique string members |
| **Ordering** | None (unordered) | Strictly ordered by numeric score |
| **Lookup Time** | $O(1)$ constant time | $O(1)$ for score lookup, $O(\log N)$ for rank |
| **Underlying Engine** | Hashtable or Intset | **Skip List** paired with a Hash Table |

> **Note:** If two members have the exact same score, Redis breaks the tie by sorting them lexicographically (alphabetical order of their string values).

## See it

Creating a sorted set and inspecting scores in `redis-cli`:

```bash
# Add players and scores to a game leaderboard
ZADD leaderboard 1500 "PlayerAlpha" 2800 "PlayerBeta" 2100 "PlayerGamma"
# Returns: (integer) 3

# Check total player count
ZCARD leaderboard
# Returns: (integer) 3

# Query a player's score
ZSCORE leaderboard "PlayerBeta"
# Returns: "2800"

# Query a player's rank (0-indexed, ascending from lowest score)
ZRANK leaderboard "PlayerAlpha"
# Returns: (integer) 0 (lowest score)

# Query rank in descending order (highest score is rank 0)
ZREVRANK leaderboard "PlayerBeta"
# Returns: (integer) 0 (highest score!)
```

Members remain permanently ordered; inserting new scores never requires a separate sort command.

## Go deeper

Redis achieves continuous $O(\log N)$ ordering by pairing two internal data structures:
1. **Hash Table:** Maps each member to its score, enabling $O(1)$ score lookups.
2. **Skip List:** A multi-layered probabilistic linked list that enables $O(\log N)$ search, insertion, deletion, and range queries.

For small sorted sets (under 128 elements and 64 bytes per member by default), Redis stores the sorted set in a compact contiguous `listpack` to save RAM.

## Watch out

- Scores are 64-bit floating-point numbers; integers exceeding $2^{53}$ may experience floating-point precision loss.
- Member strings are the unique identifiers; assigning a new score to an existing member updates their score rather than creating a duplicate.

## Remember

- Sorted Sets maintain members in continuous score order in $O(\log N)$ time.
- Backed by an internal Skip List and Hash Table dual architecture.
- When scores are tied, members are ordered lexicographically by string comparison.
