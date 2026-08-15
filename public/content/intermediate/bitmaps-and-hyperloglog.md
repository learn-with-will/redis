---
id: lesson-09
slug: bitmaps-and-hyperloglog
title: "Bitmaps and HyperLogLog"
level: intermediate
order: 9
duration: 22
tags:
  - bitmaps
  - hyperloglog
  - probabilistic
  - analytics
  - memory
summary: "Two space-efficient tools built on strings: Bitmaps (per-bit flags via SETBIT/BITCOUNT/BITOP) for dense boolean tracking, and HyperLogLog (PFADD/PFCOUNT) for counting unique items at scale with tiny, fixed memory."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Use **Bitmaps** (`SETBIT`, `GETBIT`, `BITCOUNT`, `BITOP`) to track dense boolean state.
- Estimate huge **unique counts** with **HyperLogLog** (`PFADD`, `PFCOUNT`, `PFMERGE`).
- Explain the **accuracy-for-space** trade-off that makes HyperLogLog possible.
- Choose between an exact Set and an approximate HyperLogLog for cardinality problems.

# Why It Matters

"How many unique users visited today?" and "which users were active on both Monday and Tuesday?"
are classic analytics questions. Answering them with a Set works but can cost a lot of memory at
scale. Redis offers two frugal tools: **Bitmaps**, which pack booleans into single bits, and
**HyperLogLog**, which counts uniques in a fixed ~12 KB no matter how many there are. Both trade
a little to save a lot.

# Concept Explanation

### Bitmaps: booleans by the bit

A **Bitmap** isn't a separate data type — it's a set of bit operations on an ordinary **String**.
A string can be treated as a giant array of bits (up to 512 MB → about 4 billion bits), and you
flip or read individual bits by offset:

- `SETBIT key offset value` — set the bit at `offset` to `0` or `1`.
- `GETBIT key offset` — read the bit at `offset`.
- `BITCOUNT key [start end]` — count the set (`1`) bits.
- `BITOP AND|OR|XOR|NOT destkey key [key ...]` — bitwise-combine bitmaps into a new key.
- `BITPOS key bit` — find the first `0` or `1` bit.

The classic use is **per-ID boolean state**: let bit `N` represent user ID `N`. "Was user 42
active today?" is `SETBIT active:2026-08-15 42 1`; "how many active today?" is `BITCOUNT`.

```text
127.0.0.1:6379> SETBIT active:2026-08-15 42 1
(integer) 0
127.0.0.1:6379> SETBIT active:2026-08-15 100 1
(integer) 0
127.0.0.1:6379> BITCOUNT active:2026-08-15
(integer) 2
127.0.0.1:6379> GETBIT active:2026-08-15 42
(integer) 1
```

Because you can `BITOP` two daily bitmaps, "active on **both** days" is `BITOP AND` then
`BITCOUNT`, and "active on **either** day" is `BITOP OR`. When your items are identified by dense
integer IDs, a bitmap can represent millions of booleans in a fraction of the memory a Set would
use.

### HyperLogLog: counting uniques cheaply

Sometimes you only need *how many* distinct items there are, not the items themselves — unique
visitors, distinct search terms, unique IPs. A **HyperLogLog (HLL)** is a **probabilistic** data
structure that estimates the **cardinality** (number of distinct elements) using a fixed, tiny
amount of memory — **up to about 12 KB per key** — no matter whether you add a thousand elements
or a billion.

- `PFADD key element [element ...]` — add elements (duplicates don't matter).
- `PFCOUNT key [key ...]` — the estimated distinct count (across several HLLs if given more than
  one).
- `PFMERGE destkey sourcekey [sourcekey ...]` — merge HLLs into one (e.g. weekly = merge of seven
  daily HLLs).

```text
127.0.0.1:6379> PFADD visits:2026-08-15 "u1" "u2" "u3" "u2"
(integer) 1
127.0.0.1:6379> PFCOUNT visits:2026-08-15
(integer) 3
127.0.0.1:6379> PFADD visits:2026-08-14 "u2" "u9"
(integer) 1
127.0.0.1:6379> PFMERGE visits:2days visits:2026-08-15 visits:2026-08-14
OK
127.0.0.1:6379> PFCOUNT visits:2days
(integer) 4
```

The catch: the count is an **estimate** with a **standard error of about 0.81%**. For "roughly
1.2 million uniques" style metrics that's perfect; for "exactly how many" (billing, audits) it is
not. An HLL is stored as a special string, and you cannot get the individual elements back out —
it only counts.

# Key Terminology

- **Bitmap** — bit-level operations on a String; a compact array of booleans addressed by offset.
- **Cardinality** — the number of *distinct* elements in a collection.
- **HyperLogLog (HLL)** — a probabilistic structure that estimates cardinality in fixed memory
  (~12 KB), with ~0.81% standard error.
- **Probabilistic data structure** — one that trades exactness for large space (or time) savings.

# Options and Trade-offs

Counting distinct things — pick by what you can give up:

| Approach | Memory | Accuracy | Can list members? | Use when |
| -------- | ------ | -------- | ----------------- | -------- |
| **Set** (`SADD`/`SCARD`) | Grows with cardinality | Exact | Yes | You need exact counts or the members themselves |
| **HyperLogLog** (`PFADD`/`PFCOUNT`) | Fixed ~12 KB | ~0.81% error | No | You need approximate counts of huge, high-cardinality data |
| **Bitmap** (`SETBIT`/`BITCOUNT`) | ~1 bit per possible ID | Exact | Yes (by scanning bits) | Items are dense integer IDs and you want boolean state + counts |

# Worked Example

Compare exact vs. approximate unique-visitor counting for the same data:

```text
# Exact, with a Set — stores every id
127.0.0.1:6379> SADD exact:visitors "u1" "u2" "u3" "u2"
(integer) 3
127.0.0.1:6379> SCARD exact:visitors
(integer) 3

# Approximate, with a HyperLogLog — fixed tiny memory
127.0.0.1:6379> PFADD hll:visitors "u1" "u2" "u3" "u2"
(integer) 1
127.0.0.1:6379> PFCOUNT hll:visitors
(integer) 3
```

At three elements both say `3`. The difference shows up at scale: the Set's memory grows with
every new unique visitor, while the HyperLogLog stays around 12 KB whether you've seen thousands
or billions — at the cost of the count being an estimate.

# Real World Analogy

A HyperLogLog is like a **wildlife biologist estimating a herd** from tracks and sightings rather
than tagging every animal. Tagging each one (a Set) gives an exact count but takes enormous
effort as the herd grows; the statistical estimate uses a fixed, small amount of work and lands
within about 1% — plenty to report "around 200,000." A Bitmap is the opposite: a **stadium
seating chart** where you shade in each occupied seat. If seats (IDs) are numbered and mostly
used, one dot per seat is incredibly compact.

# Examples

## Example 1 — Basic: daily active flags with a bitmap

Track whether each user was active today: `SETBIT dau:2026-08-15 <userId> 1`. `BITCOUNT
dau:2026-08-15` gives the number of active users, and `GETBIT` checks one user — all on a single
compact string.

**Why this works:** with dense integer user IDs, one bit per user is about as small as boolean
state gets, and counting is a single command.

## Example 2 — Real-world: monthly uniques from daily HLLs

Keep a HyperLogLog per day (`hll:2026-08-01` … `hll:2026-08-31`). At month end, `PFMERGE
hll:2026-08 <all daily keys>` and `PFCOUNT hll:2026-08` gives distinct monthly visitors — without
ever storing the visitor IDs.

**Why this works:** HLLs merge losslessly (the merge is still an HLL), so period roll-ups are
cheap and memory stays flat.

## Example 3 — Trade-off / pitfall: HLL where you needed exactness

A team uses `PFCOUNT` to bill customers per unique API caller. The ~0.81% error means invoices are
slightly off, and they can't audit which callers were counted (HLLs don't store members).

**Why this bites:** HyperLogLog is for *approximate* analytics, not accounting. For exact,
auditable counts, use a Set (or a real database).

# Common Mistakes

- **Using an HLL when you need exact counts or the members.** HLL only estimates, and you can't
  list what's in it.
- **Sparse IDs in a bitmap.** If IDs are huge and sparse (e.g. random 64-bit numbers), a bitmap
  wastes space — its size is driven by the highest offset you set.
- **Assuming `BITCOUNT`'s range is in bits by default.** The optional `start`/`end` are byte
  offsets unless you specify the `BIT` unit.
- **Expecting to read elements back from a HyperLogLog.** You can't — it stores only what it needs
  to estimate a count.

# Best Practices

- Reach for a **bitmap** when items are **dense integer IDs** and you want boolean state plus fast
  counts and set-like `BITOP` combinations.
- Reach for a **HyperLogLog** when you need **unique counts of very high-cardinality** data and can
  accept ~1% error for near-constant memory.
- Keep **exact** needs (billing, audits, "who exactly") on a Set or a database.
- Combine periods with `PFMERGE` (HLLs) or `BITOP` (bitmaps) rather than recomputing from raw data.

# Summary

- **Bitmaps** are bit operations on Strings: `SETBIT`/`GETBIT` flip and read bits, `BITCOUNT`
  counts set bits, `BITOP` combines bitmaps. Great for **dense integer-ID boolean state**.
- **HyperLogLog** estimates **cardinality** with fixed **~12 KB** memory and **~0.81%** error:
  `PFADD` adds, `PFCOUNT` estimates, `PFMERGE` combines.
- Both trade something for space: bitmaps assume dense IDs; HLLs give up exactness and the ability
  to list members.
- Use a **Set** when you need exact counts or the members themselves.

# Flash Cards

Q: Is a Bitmap a separate Redis data type?
A: No — bitmap commands (SETBIT, GETBIT, BITCOUNT, BITOP) operate on ordinary String values treated as arrays of bits.

Q: What does HyperLogLog estimate, and with roughly what error and memory?
A: The cardinality (number of distinct elements), with about 0.81% standard error using a fixed ~12 KB per key.

Q: Can you retrieve the individual elements stored in a HyperLogLog?
A: No — it only stores enough to estimate the count; it cannot list its members.

Q: When is a bitmap a poor fit?
A: When IDs are large and sparse — the bitmap's size grows with the highest offset you set, wasting space.

Q: Which commands add to and count a HyperLogLog?
A: PFADD to add elements, PFCOUNT to get the estimated distinct count (PFMERGE combines several HLLs).

Q: How do you count "active on both of two days" with daily bitmaps?
A: BITOP AND the two daily bitmaps into a destination key, then BITCOUNT that key.

# Exercises

### Easy
`SETBIT online 5 1` and `SETBIT online 9 1`, then `BITCOUNT online` and `GETBIT online 9`. Explain
what the count represents.

### Medium
Add a handful of values (with duplicates) to a HyperLogLog with `PFADD` and check `PFCOUNT`. Add
the same values to a Set with `SADD` and compare `SCARD`. At this small size, do they agree? Where
would they diverge in cost?

### Challenging
Model daily active users for two days as bitmaps. Compute the number of users active on **both**
days and on **either** day using `BITOP` + `BITCOUNT`. Then argue when you'd switch to
HyperLogLog instead — and what you'd give up by doing so.

# Further Reading

- Redis — *Bitmaps*: <https://redis.io/docs/latest/develop/data-types/bitmaps/>
- Redis — *HyperLogLog*: <https://redis.io/docs/latest/develop/data-types/probabilistic/hyperloglogs/>
- Redis — *SETBIT* / *BITCOUNT* / *BITOP*: <https://redis.io/commands/setbit/>
- Redis — *PFADD* / *PFCOUNT* / *PFMERGE*: <https://redis.io/commands/pfadd/>
