---
slug: zadd-and-score-updates
title: Adding Members and Modifying Scores with ZADD and ZINCRBY
topic: sets-and-sorted-sets
kind: api
summary: Master the versatile ZADD modifiers (NX, XX, GT, LT) and atomically update scores with ZINCRBY.
tags:
  - zadd
  - zincrby
  - sorted-sets
  - api
related:
  - sorted-sets-scores-and-ordering
  - range-queries-by-index-and-score
  - building-leaderboards
---
> **In one line:** Insert and update sorted set members with `ZADD` modifiers (`NX`, `XX`, `GT`, `LT`) and increment scores with `ZINCRBY`.

## The idea

The `ZADD` command is packed with optional conditional modifiers that control how scores are inserted and updated. Rather than checking an existing score in client code, Redis provides atomic server-side conditions.

Similarly, `ZINCRBY` allows applications to atomically increase or decrease a member's score in-place without race conditions.

| Command / Modifier | Arguments | Description / Behavior |
|---|---|---|
| `ZADD key score member [...]` | Score and member | Adds members or updates their existing scores |
| `ZADD ... NX` | Modifier | Only add **new** members; never update existing scores |
| `ZADD ... XX` | Modifier | Only update **existing** members; never add new members |
| `ZADD ... GT` | Modifier | Only update score if the new score is **greater than** current score |
| `ZADD ... LT` | Modifier | Only update score if the new score is **less than** current score |
| `ZINCRBY key increment member` | Increment and member | Atomically adds float increment to member's score |

> **Tip:** The `GT` (greater than) modifier is ideal for game high-scores, ensuring a player's leaderboard entry only updates when they achieve a new personal best.

## See it

Using conditional modifiers and atomic score increments:

```bash
# Add a player's initial score
ZADD arcade:high_scores 10000 "GamerOne"
# Returns: (integer) 1

# Attempt to update score using GT (Greater Than)
# Scenario A: New score is LOWER (9000 < 10000) -> Ignored!
ZADD arcade:high_scores GT 9000 "GamerOne"
# Returns: (integer) 0

ZSCORE arcade:high_scores "GamerOne"
# Returns: "10000" (Score was preserved!)

# Scenario B: New score is HIGHER (12500 > 10000) -> Updated!
ZADD arcade:high_scores GT 12500 "GamerOne"
# Returns: (integer) 0

# Atomically increment score during gameplay
ZINCRBY arcade:high_scores 500 "GamerOne"
# Returns: "13000"
```

Notice that `ZINCRBY` creates the member with the increment as its initial score if the member does not already exist.

## Go deeper

The return value of `ZADD` by default reflects only the number of *new members added*. If an existing member's score is updated, it is not counted in the integer reply.

Passing the `CH` (changed) flag instructs Redis to return the total number of members *changed* (new members added plus existing members whose scores were modified), which is essential for tracking updates in application code.

## Watch out

- `GT`, `LT`, and `NX` are mutually exclusive; you cannot specify `GT` and `NX` together.
- In high-throughput systems, frequent score updates across large sorted sets trigger continuous skip-list node reorganizations.

## Remember

- `ZADD` inserts or updates members in $O(\log N)$ time.
- Modifiers `GT` and `LT` allow atomic high-watermark or low-watermark updates.
- `ZINCRBY` atomically increments floating-point scores without race conditions.
