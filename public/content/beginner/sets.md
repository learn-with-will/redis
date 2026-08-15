---
id: lesson-06
slug: sets
title: "Sets"
level: beginner
order: 6
duration: 20
tags:
  - sets
  - uniqueness
  - set-algebra
  - tags
  - data-types
summary: "The Redis Set type: an unordered collection of unique members. Learn SADD/SISMEMBER/SMEMBERS, the set-algebra commands (SINTER, SUNION, SDIFF), and patterns like tags, unique visitors, and relationships."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Add, remove, and test membership with `SADD`, `SREM`, `SISMEMBER`, `SMISMEMBER`.
- List and count members with `SMEMBERS` and `SCARD` (and iterate big sets with `SSCAN`).
- Combine sets with **set algebra**: `SINTER`, `SUNION`, `SDIFF` (and their `...STORE` forms).
- Pick random members with `SPOP` / `SRANDMEMBER`.
- Recognize when a Set is the right structure (uniqueness, tags, relationships).

# Why It Matters

Whenever you need "a collection of distinct things" — the set of tags on an article, the users
who liked a post, the IPs seen today — a Redis **Set** gives you automatic de-duplication plus
instant membership tests and the ability to combine collections (intersection, union,
difference) with single commands. That last part is a genuine superpower: "which users follow
*both* A and B?" becomes one `SINTER`.

# Concept Explanation

### What a Set is

A Redis **Set** is an **unordered** collection of **unique** string members. Adding a member
that's already there does nothing; there are no duplicates and no defined order.

- `SADD key member [member ...]` — add members; returns how many were **new**.
- `SREM key member [member ...]` — remove members.
- `SISMEMBER key member` — `1` if present, `0` if not; `SMISMEMBER key m1 m2 ...` tests several.
- `SMEMBERS key` — all members (O(N); use `SSCAN` for big sets).
- `SCARD key` — the count of members (the **cardinality**).

```text
127.0.0.1:6379> SADD tags:post:9 "redis" "database" "cache"
(integer) 3
127.0.0.1:6379> SADD tags:post:9 "redis"
(integer) 0
127.0.0.1:6379> SISMEMBER tags:post:9 "cache"
(integer) 1
127.0.0.1:6379> SCARD tags:post:9
(integer) 3
```

The second `SADD` returns `0` because `"redis"` was already present — uniqueness is enforced for
you.

### Set algebra

The headline feature is combining sets:

- `SINTER key [key ...]` — members in **all** given sets (intersection).
- `SUNION key [key ...]` — members in **any** of them (union).
- `SDIFF key [key ...]` — members in the first set but **not** the others (difference).
- `SINTERCARD numkeys key [key ...]` — just the **size** of the intersection (optionally with a
  `LIMIT`), without materializing it.

Each also has a `...STORE` variant (`SINTERSTORE`, `SUNIONSTORE`, `SDIFFSTORE`) that writes the
result into a destination key instead of returning it — handy for caching a computed set.

```text
127.0.0.1:6379> SADD follows:alice "bob" "carol" "dave"
(integer) 3
127.0.0.1:6379> SADD follows:bob "carol" "erin"
(integer) 2
127.0.0.1:6379> SINTER follows:alice follows:bob
1) "carol"
```

Alice and Bob both follow Carol — one command found the mutual connection.

### Random members

- `SPOP key [count]` — remove and return random member(s).
- `SRANDMEMBER key [count]` — return random member(s) **without** removing.

These power things like "pick a random winner" or sampling.

# Key Terminology

- **Set** — an unordered collection of unique strings.
- **Member** — one element of a set.
- **Cardinality** — the number of members (`SCARD`).
- **Intersection / union / difference** — the three set-algebra operations.
- **`SSCAN`** — cursor-based iteration over a set (like `SCAN`), for large sets.

# Options and Trade-offs

When you need "a collection," which type fits:

| Option | Ordering | Duplicates? | Best for | Watch out for |
| ------ | -------- | ----------- | -------- | ------------- |
| **Set** | None | No (unique) | Membership, tags, relationships, set algebra | No order; `SMEMBERS` is O(N) |
| **List** | Insertion order | Yes | Queues, stacks, "recent N" | No fast membership test |
| **Sorted Set** (next lesson) | By score | No (unique) | Rankings, ranges, priority | Slightly more overhead per op |

# Worked Example

Track today's unique visitors and compare with yesterday's:

```text
127.0.0.1:6379> SADD visitors:2026-08-15 "u1" "u2" "u3"
(integer) 3
127.0.0.1:6379> SADD visitors:2026-08-15 "u2"
(integer) 0
127.0.0.1:6379> SCARD visitors:2026-08-15
(integer) 3
127.0.0.1:6379> SADD visitors:2026-08-14 "u2" "u9"
(integer) 2
127.0.0.1:6379> SINTER visitors:2026-08-15 visitors:2026-08-14
1) "u2"
127.0.0.1:6379> SDIFF visitors:2026-08-15 visitors:2026-08-14
1) "u1"
2) "u3"
```

Duplicates are ignored automatically, `SCARD` gives the unique count, `SINTER` finds returning
visitors (`u2`), and `SDIFF` finds who's new today (`u1`, `u3`).

# Real World Analogy

A Set is the **guest list** at a door. Each name is on it once (add a name twice and nothing
changes), order doesn't matter, and checking "is this person on the list?" is instant
(`SISMEMBER`). Comparing two guest lists — who's on *both*, on *either*, or on *this one but not
that one* — is exactly `SINTER`, `SUNION`, and `SDIFF`.

# Examples

## Example 1 — Basic: tagging

Store an article's tags in `tags:article:5` with `SADD`. Adding the same tag twice is harmless.
To find articles sharing tags, keep a reverse index (`tag:redis` → set of article IDs) and
`SINTER tag:redis tag:cache` to get articles tagged with both.

**Why this works:** sets enforce unique tags and make "tagged with both" a single intersection.

## Example 2 — Real-world: mutual followers

With each user's follows stored as a set, `SINTER follows:alice follows:bob` returns everyone
they both follow, and `SINTERCARD 2 follows:alice follows:bob` returns just how many — without
building the list.

**Why this works:** relationships map cleanly onto sets, and the server computes the overlap far
faster than fetching both lists to your app and comparing.

## Example 3 — Trade-off / pitfall: `SMEMBERS` on a huge set

A set holds every user ID (tens of millions). Calling `SMEMBERS` returns them all in one O(N)
blocking reply, hammering memory and latency.

**Why this bites:** like `KEYS` and `HGETALL`, `SMEMBERS` is unpaginated. Use `SCARD` for a
count, `SISMEMBER` for a membership test, or `SSCAN` to iterate — you rarely need every member at
once.

# Common Mistakes

- **Reaching for a Set when you need order.** Sets are unordered; if position matters, use a List
  or Sorted Set.
- **`SMEMBERS` on large sets.** Prefer `SCARD`, `SISMEMBER`, or `SSCAN`.
- **Recomputing intersections in your app.** Let Redis do `SINTER`/`SUNION`/`SDIFF` server-side;
  it's faster and simpler.
- **Forgetting the `...STORE` variants.** If you'll reuse a computed set, `SINTERSTORE` caches it
  instead of recomputing each time.

# Best Practices

- Use a Set whenever **uniqueness** or **membership testing** is the point.
- Model relationships and reverse indexes (tag → items) as sets to unlock cheap set algebra.
- Use `SINTERCARD` when you only need the **size** of an overlap.
- Iterate large sets with `SSCAN`; never `SMEMBERS` a set that can grow unbounded.

# Summary

- A **Set** is an **unordered** collection of **unique** strings.
- `SADD`/`SREM` add/remove (SADD returns new-member count); `SISMEMBER`/`SMISMEMBER` test
  membership; `SCARD` counts; `SMEMBERS` lists (O(N)); `SSCAN` iterates.
- **Set algebra** — `SINTER`, `SUNION`, `SDIFF` (and `...STORE` variants) — combines sets in one
  command; `SINTERCARD` returns just the intersection size.
- `SPOP`/`SRANDMEMBER` pick random members (with/without removal).
- Great for **tags, unique counts, membership, and relationships**; use a List or Sorted Set when
  you need order.

# Flash Cards

Q: What two properties define a Redis Set?
A: Its members are unique (no duplicates) and unordered.

Q: What does SADD return?
A: The number of members that were newly added (members already present don't count).

Q: Which command finds the members common to several sets?
A: SINTER (the intersection); SUNION gives the union and SDIFF the difference.

Q: How do you get just the SIZE of an intersection without building it?
A: SINTERCARD (optionally with a LIMIT).

Q: Why avoid SMEMBERS on a very large set?
A: It returns every member in one O(N) blocking reply; use SCARD, SISMEMBER, or SSCAN instead.

Q: What's the difference between SPOP and SRANDMEMBER?
A: SPOP removes and returns random member(s); SRANDMEMBER returns random member(s) without removing them.

# Exercises

### Easy
`SADD colors red green blue`, then `SADD colors red` again and note it returns `0`. Check
membership with `SISMEMBER colors green` and the count with `SCARD colors`.

### Medium
Create `SADD a 1 2 3 4` and `SADD b 3 4 5 6`. Predict and then check the output of `SINTER a b`,
`SUNION a b`, and `SDIFF a b`. Explain each result in one sentence.

### Challenging
Model a simple "users who liked each post" system with sets `likes:post:1`, `likes:post:2`.
Using set commands, find users who liked **both** posts, and the total number of **distinct**
users who liked **either** post. Which commands did you use, and which one avoided returning the
full list?

# Further Reading

- Redis — *Redis Sets*: <https://redis.io/docs/latest/develop/data-types/sets/>
- Redis — *SADD* / *SINTER* / *SDIFF*: <https://redis.io/commands/sadd/>
- Redis — *SINTERCARD*: <https://redis.io/commands/sintercard/>
- Redis — *SSCAN*: <https://redis.io/commands/sscan/>
