---
slug: set-membership-and-manipulation
title: Managing Sets with SADD, SREM, and SISMEMBER
topic: sets-and-sorted-sets
kind: api
summary: Master fundamental Set operations to insert members with SADD, remove with SREM, and inspect with SMEMBERS.
tags:
  - sets
  - sadd
  - srem
  - sismember
  - api
related:
  - set-data-structure-basics
  - set-algebra-sinter-sunion-sdiff
  - set-modeling-patterns
---
> **In one line:** Manipulate sets with `SADD`, `SREM`, `SISMEMBER`, `SMISMEMBER`, and random sampling via `SRANDMEMBER`.

## The idea

Redis Sets provide an intuitive API for adding, removing, and testing membership. Because sets are backed by hash tables or sorted intsets, individual element modifications execute in constant $O(1)$ time per member.

Redis 6.2 introduced `SMISMEMBER`, allowing applications to test multiple members in a single network round-trip.

| Command | Arguments | Time Complexity | Return Value / Behavior |
|---|---|---|---|
| `SADD key member [member ...]` | Key and elements | $O(N)$ for $N$ members | Number of members actually added |
| `SREM key member [member ...]` | Key and elements | $O(N)$ for $N$ members | Number of members actually removed |
| `SISMEMBER key member` | Key and single element | $O(1)$ | `1` if member exists, `0` otherwise |
| `SMISMEMBER key member [...]` | Key and elements | $O(N)$ for $N$ members | Array of `1`s and `0`s matching query order |
| `SPOP key [count]` | Key and optional count | $O(N)$ | Randomly removes and returns members |
| `SRANDMEMBER key [count]` | Key and optional count | $O(N)$ | Returns random members **without** removing them |

> **Tip:** `SPOP` is ideal for raffles, lottery drawings, and task distribution where items must be consumed randomly.

## See it

Managing user permissions and drawing random winners:

```bash
# Add permissions to a user role set
SADD role:editor:permissions "post:create" "post:edit" "post:publish"
# Returns: (integer) 3

# Test multiple permissions in a single round-trip
SMISMEMBER role:editor:permissions "post:edit" "post:delete" "post:create"
# Returns:
# 1) (integer) 1
# 2) (integer) 0
# 3) (integer) 1

# Remove a specific permission
SREM role:editor:permissions "post:publish"
# Returns: (integer) 1

# Draw a random winner from a contest pool without removing them
SADD giveaway:entrants "user_10" "user_22" "user_33" "user_44"
SRANDMEMBER giveaway:entrants 1
# Returns: "user_33"

# Draw and pop a winner (removes them so they cannot win again)
SPOP giveaway:entrants 1
# Returns: "user_22"
```

Notice how `SRANDMEMBER` samples elements without mutation, while `SPOP` mutates the set by removing the chosen elements.

## Go deeper

When using `SRANDMEMBER key count`:
- Passing a positive count (e.g., `3`) returns up to 3 distinct unique elements.
- Passing a negative count (e.g., `-3`) allows replacement, potentially returning duplicate elements if the set has fewer members than requested.

When the last member of a Set is removed via `SREM` or `SPOP`, Redis automatically purges the key from the keyspace dictionary.

## Watch out

- Using `SMEMBERS` on large sets can saturate network bandwidth; use `SSCAN` for safe iteration.
- Passing non-existent keys to `SCARD` returns `0` rather than throwing an error.

## Remember

- `SADD` and `SREM` add and remove members in constant time per element.
- `SMISMEMBER` checks multiple memberships in a single atomic round-trip.
- `SPOP` removes elements randomly, whereas `SRANDMEMBER` inspects without removing.
