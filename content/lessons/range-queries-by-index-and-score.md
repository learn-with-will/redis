---
slug: range-queries-by-index-and-score
title: Querying Ranges by Index and Score with ZRANGE
topic: sets-and-sorted-sets
kind: technique
summary: Retrieve sorted set members by index rank or score boundaries using the unified modern ZRANGE command.
tags:
  - zrange
  - queries
  - pagination
  - sorted-sets
related:
  - sorted-sets-scores-and-ordering
  - zadd-and-score-updates
  - building-leaderboards
---
> **In one line:** The modern `ZRANGE` command unifies rank, score, and lexicographical queries with optional reversal and pagination.

## The idea

In earlier versions of Redis, querying sorted sets required choosing between multiple specialized commands: `ZRANGE`, `ZREVRANGE`, `ZRANGEBYSCORE`, `ZREVRANGEBYSCORE`, and `ZRANGEBYLEX`.

Modern Redis (since version 6.2) unifies all range querying into the single, versatile `ZRANGE` command using argument flags.

| Query Mode | ZRANGE Flags | Example Usage | What It Queries |
|---|---|---|---|
| **By Rank (Default)** | None | `ZRANGE key 0 9` | Bottom 10 members by rank (ascending) |
| **By Rank (Reversed)** | `REV` | `ZRANGE key 0 9 REV` | Top 10 members by rank (descending) |
| **By Score** | `BYSCORE` | `ZRANGE key 100 500 BYSCORE` | Members with scores between 100 and 500 |
| **Include Scores** | `WITHSCORES` | `ZRANGE key 0 5 REV WITHSCORES` | Returns array alternating members and scores |
| **Paginated Limit** | `LIMIT offset count` | `ZRANGE key 0 1000 BYSCORE LIMIT 0 10` | Paginates through matching score slices |

> **Tip:** Always use `WITHSCORES` when rendering leaderboard tables so you receive the score alongside each member name in a single call.

## See it

Querying top players and score brackets with `ZRANGE`:

```bash
# Seed leaderboard data
ZADD tournament 450 "Alice" 780 "Bob" 920 "Charlie" 610 "Diana" 830 "Ethan"

# Query the top 3 players (descending order) with their scores
ZRANGE tournament 0 2 REV WITHSCORES
# Returns:
# 1) "Charlie"
# 2) "920"
# 3) "Ethan"
# 4) "830"
# 5) "Bob"
# 6) "780"

# Find all players with scores between 600 and 800
ZRANGE tournament 600 800 BYSCORE WITHSCORES
# Returns:
# 1) "Diana"
# 2) "610"
# 3) "Bob"
# 4) "780"

# Count members within a score bracket in O(log N)
ZCOUNT tournament 600 800
# Returns: (integer) 2
```

Notice how `REV` reverses the sorting order seamlessly without requiring legacy `ZREVRANGE` commands.

## Go deeper

`ZRANGE` also supports exclusive interval bounds using the `(` prefix. For example:
```bash
# Scores strictly greater than 600 and strictly less than 800:
ZRANGE tournament (600 (800 BYSCORE
```

You can use `-inf` and `+inf` to represent negative and positive infinity when querying open-ended score ranges. Counting elements inside a score window with `ZCOUNT key min max` executes in $O(\log N)$ time thanks to the skip list index.

## Watch out

- Passing `0 -1` on a massive sorted set returns every element, which can saturate network bandwidth and freeze the server.
- The `LIMIT` clause is only valid when combined with `BYSCORE` or `BYLEX`.

## Remember

- Modern `ZRANGE` unifies index, score, and lexicographical queries under one command.
- Add `REV` for descending order and `WITHSCORES` to include score values.
- `ZCOUNT` calculates member counts within score ranges in $O(\log N)$ time.
