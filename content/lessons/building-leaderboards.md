---
slug: building-leaderboards
title: Real-Time Leaderboard Pattern with Sorted Sets
topic: sets-and-sorted-sets
kind: pattern
summary: Build real-time million-user gaming leaderboards and percentile ranks using Redis Sorted Sets.
tags:
  - leaderboards
  - patterns
  - gaming
  - sorted-sets
related:
  - sorted-sets-scores-and-ordering
  - zadd-and-score-updates
  - range-queries-by-index-and-score
---
> **In one line:** Sorted Sets power real-time leaderboards by maintaining dynamic score rankings across millions of users in $O(\log N)$ time.

## The idea

Building a real-time leaderboard in a traditional relational database requires queries like `SELECT user_id, score FROM players ORDER BY score DESC LIMIT 10`. On tables with millions of rows, calculating ranks dynamically under heavy write traffic causes severe database indexing bottlenecks.

Redis Sorted Sets solve this natively. Because the underlying skip list maintains continuous ordering as scores are updated, fetching the top 10 players or computing an individual user's exact global rank requires zero sorting overhead.

| Leaderboard Requirement | Redis Command | Time Complexity |
|---|---|---|
| **Fetch Top 10 Players** | `ZRANGE leaderboard 0 9 REV WITHSCORES` | $O(\log N + M)$ where $M=10$ |
| **Get User's Exact Rank** | `ZREVRANK leaderboard "user_42"` | $O(\log N)$ |
| **Get User's Current Score** | `ZSCORE leaderboard "user_42"` | $O(1)$ |
| **Fetch Users Surrounding Me** | `ZREVRANGE leaderboard (rank-2) (rank+2)` | $O(\log N + M)$ |

> **Tip:** Global rank in Redis is 0-indexed; add 1 in your application layer so the highest score displays as Rank #1.

## See it

Implementing a complete leaderboard workflow in `redis-cli`:

```bash
# 1. Update player scores as games conclude
ZADD season_leaderboard 1420 "user:alice" 2890 "user:bob" 1950 "user:charlie" 3100 "user:diana"

# 2. Fetch the current Top 3 podium
ZRANGE season_leaderboard 0 2 REV WITHSCORES
# 1) "user:diana" 2) "3100" 3) "user:bob" 4) "2890"

# 3. User Alice logs in; check her rank and score
ZREVRANK season_leaderboard "user:alice"
# (integer) 3 (0-indexed; Alice is in 4th place)
ZSCORE season_leaderboard "user:alice"
# "1420"

# 4. Alice wins a match! Increment her score by 600 points
ZINCRBY season_leaderboard 600 "user:alice"
# "2020"

# 5. Check Alice's new rank
ZREVRANK season_leaderboard "user:alice"
# (integer) 2 (Alice jumped up to 3rd place!)
```

The entire recalculation occurs in microseconds directly in server memory.

## Go deeper

To render a "Players Around Me" view (displaying the user plus 2 players immediately above and below them):
1. Query user's rank: `rank = ZREVRANK leaderboard user_id`.
2. Compute range: `start = max(0, rank - 2)`, `stop = rank + 2`.
3. Fetch slice: `ZRANGE leaderboard start stop REV WITHSCORES`.

This pattern provides the engaging competitive feedback loop found in top mobile games and fitness applications without overloading primary databases.

## Watch out

- When multiple users share the exact same score, rank order defaults to lexicographical member name sorting.
- Partitioning massive leaderboards across Redis Cluster requires client-side aggregation or secondary buckets.

## Remember

- Sorted Sets deliver instant top-$N$ leaderboards via `ZRANGE ... REV`.
- `ZREVRANK` queries any user's exact ranking position in $O(\log N)$ time.
- Dynamic score updates automatically adjust rankings in real time.
