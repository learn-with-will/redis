---
slug: lexicographical-and-time-ranges
title: Lexicographical and Time-Series Modeling with Sorted Sets
topic: sets-and-sorted-sets
kind: technique
summary: Model auto-complete prefixes and timestamped event ranges using lexicographical ordering and Unix epoch scores.
tags:
  - sorted-sets
  - lexicographical
  - time-series
  - autocomplete
related:
  - sorted-sets-scores-and-ordering
  - range-queries-by-index-and-score
  - building-leaderboards
---
> **In one line:** Set all scores to `0` for lexicographical auto-complete or use Unix timestamps as scores for time-series ranges.

## The idea

Sorted Sets can be adapted for specialized search patterns by controlling how scores are assigned:
1. **Lexicographical String Search (Auto-complete):** If all members have the exact same score (e.g., `0`), Redis orders them purely alphabetically by byte comparison. This powers instant search-as-you-type prefix matching.
2. **Time-Series Range Indexing:** If the score represents a Unix epoch timestamp (milliseconds or seconds), the sorted set becomes an indexed time-series log where you can query events within any time window.

| Pattern | Score Strategy | Query Mode | Example Usage |
|---|---|---|---|
| **Auto-complete / Dictionary** | All scores = `0` | `ZRANGE key [prefix [prefixÿ BYLEX` | Prefix lookup for user search queries |
| **Time-Series Event Log** | Score = Unix timestamp | `ZRANGE key min_ts max_ts BYSCORE` | Fetching sensor readings from past hour |
| **Sliding Window Rate Limit** | Score = Current timestamp | `ZREMRANGEBYSCORE key 0 (now - window)` | Evicting expired request events |

> **Tip:** Use `ÿ` (the highest possible byte) to represent the upper boundary when performing prefix matching with `BYLEX`.

## See it

Implementing search auto-complete using lexicographical sorted sets:

```bash
# Add dictionary terms with identical score 0
ZADD autocomplete 0 "apple" 0 "application" 0 "apply" 0 "banana" 0 "band"

# Query words starting with "app"
# '[' means inclusive, '(' means exclusive
ZRANGE autocomplete "[app" "[appÿ" BYLEX
# Returns:
# 1) "apple"
# 2) "application"
# 3) "apply"

# Time-series modeling: Store events by Unix timestamp
ZADD timeline 1700000000 "login_event" 1700000060 "page_view" 1700000120 "logout_event"

# Fetch all events between timestamp 1700000000 and 1700000100
ZRANGE timeline 1700000000 1700000100 BYSCORE
# Returns:
# 1) "login_event"
# 2) "page_view"
```

Notice how assigning score `0` transforms the Sorted Set into an indexed prefix tree.

## Go deeper

To remove time-series events that have aged out of a rolling sliding window, use `ZREMRANGEBYSCORE`:

```bash
# Remove all events older than timestamp 1700000050
ZREMRANGEBYSCORE timeline 0 1700000050
# Returns: (integer) 1
```

This single command enables the classic **Sliding Window Log** algorithm for distributed API rate limiters, purging stale requests and returning the count of remaining active requests in $O(\log N + M)$ time.

## Watch out

- `BYLEX` queries require that all members have identical scores; mixed scores produce undefined lexicographical ordering.
- Timestamps with millisecond resolution require 64-bit integers; avoid rounding errors when serializing epoch floats.

## Remember

- Uniform scores (all 0) enable alphabetized lexicographical prefix matching with `BYLEX`.
- Unix timestamps as scores create indexed time-series logs queryable with `BYSCORE`.
- `ZREMRANGEBYSCORE` purges expired time windows in sliding-window rate limiters.
