---
id: lesson-07
slug: sorted-sets
title: "Sorted Sets"
level: beginner
order: 7
duration: 24
tags:
  - sorted-sets
  - leaderboards
  - ranking
  - priority-queue
  - data-types
summary: "The Redis Sorted Set: unique members each ranked by a numeric score. Learn ZADD/ZRANGE/ZRANK/ZINCRBY and build leaderboards, time-ordered feeds, and priority queues with O(log N) operations."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Add and update scored members with `ZADD` and `ZINCRBY`.
- Read members by rank (`ZRANGE`) and by score range (`ZRANGEBYSCORE`), ascending or descending.
- Find a member's rank and score with `ZRANK` / `ZREVRANK` / `ZSCORE`.
- Build a **leaderboard**, a **time-ordered feed**, and a **priority queue**.
- Explain why sorted-set operations are efficient (O(log N)).

# Why It Matters

A **Sorted Set** is Redis's answer to "keep these items ranked, and let me query the ranking
fast." Leaderboards, "top stories," priority queues, time-ordered timelines, and sliding-window
rate limiters all fall out of one structure. It combines the uniqueness of a Set with an
always-maintained order — so you never re-sort anything.

# Concept Explanation

### What a Sorted Set is

A Redis **Sorted Set** (often written *zset*) holds **unique members**, and each member has an
associated **score** — a floating-point number. Members are kept **ordered by score** (ties are
broken by the member's own lexicographic order). You get Set-like uniqueness *plus* a live
ranking.

- `ZADD key score member [score member ...]` — add/update members with scores; returns the count
  of **new** members added.
- `ZSCORE key member` — a member's score.
- `ZINCRBY key increment member` — atomically add to a member's score.
- `ZCARD key` — number of members.
- `ZREM key member [...]` — remove members.

```text
127.0.0.1:6379> ZADD leaderboard 100 "ada" 90 "brian" 120 "cleo"
(integer) 3
127.0.0.1:6379> ZSCORE leaderboard "cleo"
"120"
127.0.0.1:6379> ZINCRBY leaderboard 25 "brian"
"115"
```

### Reading the ranking

By rank (position), lowest score first:

- `ZRANGE key start stop [WITHSCORES]` — members from rank `start` to `stop` (ascending).
- Add `REV` for descending (highest first) — perfect for "top N".
- `ZRANK key member` / `ZREVRANK key member` — a member's 0-based position, ascending / descending.

```text
127.0.0.1:6379> ZRANGE leaderboard 0 -1 WITHSCORES
1) "brian"
2) "115"
3) "ada"
4) "100"
5) "cleo"
6) "120"
127.0.0.1:6379> ZRANGE leaderboard 0 2 REV WITHSCORES
1) "cleo"
2) "120"
3) "brian"
4) "115"
5) "ada"
6) "100"
```

By score range:

- `ZRANGEBYSCORE key min max` — members whose score is within `[min, max]` (use `-inf`/`+inf`
  for open ends). The modern form is `ZRANGE key min max BYSCORE`.
- `ZCOUNT key min max` — how many fall in a score range.

### Popping by score

- `ZPOPMIN key [count]` / `ZPOPMAX key [count]` — remove and return the lowest / highest scored
  members. `BZPOPMIN` / `BZPOPMAX` are the **blocking** versions — the basis of a **priority
  queue** (score = priority; workers pop the highest/lowest first).

### Why it's fast

Sorted sets are backed by a structure that keeps everything ordered, so the key operations —
`ZADD`, `ZSCORE`, `ZRANK`, `ZINCRBY` — are **O(log N)**, and reading a slice with `ZRANGE` is
**O(log N + M)** for M returned elements. You get ranked queries without ever paying to re-sort.

# Key Terminology

- **Sorted Set (zset)** — unique members, each with a numeric **score**, kept ordered by score.
- **Score** — a floating-point number (IEEE-754 double) attached to a member; drives ordering.
- **Rank** — a member's 0-based position in the ordering (`ZRANK` ascending, `ZREVRANK`
  descending).
- **O(log N)** — the cost of the core operations, thanks to the ordered backing structure.

# Options and Trade-offs

Using the score to model different problems:

| Score means… | Query you get for free | Example |
| ------------ | ---------------------- | ------- |
| **Points** | Top N by `ZRANGE ... REV` | Game/quiz leaderboard |
| **Timestamp** | "Between these times" via `ZRANGEBYSCORE` | Activity timeline, sliding-window rate limit |
| **Priority** | Highest/lowest first via `ZPOPMAX`/`ZPOPMIN` | Job scheduler / priority queue |
| **Money / metric** | Range + rank queries | Price bands, percentile lookups |

# Worked Example

A live quiz leaderboard: add scores, bump one player, then read the top three.

```text
127.0.0.1:6379> ZADD scores 50 "sam" 80 "priya" 65 "leo"
(integer) 3
127.0.0.1:6379> ZINCRBY scores 40 "sam"
"90"
127.0.0.1:6379> ZREVRANK scores "sam"
(integer) 0
127.0.0.1:6379> ZRANGE scores 0 2 REV WITHSCORES
1) "sam"
2) "90"
3) "priya"
4) "80"
5) "leo"
6) "65"
```

After a 40-point boost, Sam jumps to first (`ZREVRANK` = 0), and the top three come back already
ordered — no sorting on your side.

# Real World Analogy

A sorted set is an **always-current sports league table**. Every team (member) has points
(score); the table stays sorted the instant any result changes (`ZINCRBY`). You can ask "who's
top?" (`ZRANGE ... REV`), "what position is my team?" (`ZREVRANK`), or "who has between 40 and 60
points?" (`ZRANGEBYSCORE`) — and the answer is instant because the table was never out of order.

# Examples

## Example 1 — Basic: a top-10 leaderboard

Store each player's points with `ZADD board <points> <player>`, bump with `ZINCRBY`, and render
the leaderboard with `ZRANGE board 0 9 REV WITHSCORES`. A player's own rank is `ZREVRANK board
<player>`.

**Why this works:** the sorted set maintains order continuously, so "top 10" and "my rank" are
single O(log N)-ish commands instead of a re-sort.

## Example 2 — Real-world: a time-ordered feed

Use the event timestamp as the score: `ZADD feed <unix_ts> <event_id>`. Then `ZRANGEBYSCORE feed
<start> <end>` returns everything in a time window, and `ZRANGE feed 0 -1 REV` gives newest-first.

**Why this works:** scoring by time turns "give me the last hour" and "newest first" into range
and reverse-range queries.

## Example 3 — Trade-off / pitfall: unbounded growth

A leaderboard for "all users ever" keeps growing; some queries `ZRANGE 0 -1` (the whole thing).
Memory climbs and the full-range read gets expensive.

**Why this bites:** sorted sets are efficient per operation, but reading *all* members is still
O(N), and unbounded membership costs memory. Cap it (keep only the top N, or expire old entries
by score with `ZREMRANGEBYSCORE`) and read slices, not the whole set.

# Common Mistakes

- **Reading the whole set** with `ZRANGE 0 -1` when you only need a slice or a range.
- **Forgetting `WITHSCORES`** when you need the scores, then making a second round trip.
- **Confusing rank and score.** `ZRANK` returns *position*; `ZSCORE` returns the *value*. "Top"
  usually means highest score → use `REV`.
- **Letting a leaderboard grow forever.** Trim by rank or expire old entries by score.

# Best Practices

- Choose what the **score** represents up front (points, timestamp, priority) — it defines which
  queries are cheap.
- Use `ZINCRBY` to update scores atomically instead of read-modify-write.
- Read **slices** (`ZRANGE 0 9 REV`) and **ranges** (`ZRANGEBYSCORE`), not the whole set.
- For priority queues, use `ZPOPMIN`/`ZPOPMAX` (or the blocking `BZPOPMIN`/`BZPOPMAX`).
- Bound growth: cap membership or prune old entries with `ZREMRANGEBYSCORE` / `ZREMRANGEBYRANK`.

# Summary

- A **Sorted Set** holds unique members, each with a floating-point **score**, kept **ordered by
  score**.
- `ZADD` adds/updates, `ZINCRBY` bumps a score, `ZSCORE` reads it — all **O(log N)**.
- `ZRANGE` reads by rank (add `REV` for top-N, `WITHSCORES` for scores); `ZRANGEBYSCORE` reads by
  score range; `ZRANK`/`ZREVRANK` give position.
- `ZPOPMIN`/`ZPOPMAX` (and blocking `BZPOPMIN`/`BZPOPMAX`) make **priority queues**.
- Perfect for **leaderboards, time-ordered feeds, and priority queues** — just keep growth
  bounded and read slices, not everything.

# Flash Cards

Q: How does a Sorted Set differ from a plain Set?
A: Every member has a numeric score, and members are kept ordered by that score (still unique).

Q: How do you read the top 3 highest-scoring members with their scores?
A: ZRANGE key 0 2 REV WITHSCORES (REV sorts high-to-low; WITHSCORES includes the scores).

Q: Which command atomically increases a member's score?
A: ZINCRBY key increment member.

Q: What's the difference between ZRANK and ZSCORE?
A: ZRANK returns the member's position (rank) in the ordering; ZSCORE returns the member's actual score value.

Q: What is the time complexity of ZADD and ZSCORE?
A: O(log N), thanks to the ordered backing structure — so you never re-sort.

Q: How would you build a priority queue with a sorted set?
A: Use the score as priority and pop with ZPOPMIN/ZPOPMAX (or block with BZPOPMIN/BZPOPMAX).

# Exercises

### Easy
`ZADD race 10 "car" 5 "bike" 20 "plane"`. Read all with `ZRANGE race 0 -1 WITHSCORES` (ascending)
and the fastest-first order with `ZRANGE race 0 -1 REV WITHSCORES`.

### Medium
Build a leaderboard: `ZADD lb 100 alice 200 bob`, then `ZINCRBY lb 150 alice`. Show the top two
with scores and find `alice`'s rank from the top with `ZREVRANK`. Explain what changed and why.

### Challenging
Model a time-ordered feed: `ZADD feed <ts> <id>` for a few events with increasing timestamps.
Retrieve events in a time window using `ZRANGEBYSCORE`, and newest-first using `ZRANGE ... REV`.
Then propose how you'd remove events older than a cutoff timestamp in one command.

# Further Reading

- Redis — *Redis Sorted Sets*: <https://redis.io/docs/latest/develop/data-types/sorted-sets/>
- Redis — *ZADD* / *ZRANGE* / *ZRANGEBYSCORE*: <https://redis.io/commands/zadd/>
- Redis — *ZINCRBY* / *ZRANK*: <https://redis.io/commands/zincrby/>
- Redis — *ZPOPMIN* / *BZPOPMIN*: <https://redis.io/commands/zpopmin/>
