---
slug: bitmap-analytics-bitcount-bitop
title: Counting and Combining Bits with BITCOUNT and BITOP
topic: advanced-data-types
kind: technique
summary: Perform high-speed population counts and bitwise operations (AND, OR, XOR) across bitmaps with BITCOUNT and BITOP.
tags:
  - bitmaps
  - bitcount
  - bitop
  - analytics
related:
  - bitmaps-per-bit-flags
  - hyperloglog-concept-cardinality
  - set-algebra-sinter-sunion-sdiff
---
> **In one line:** Count active flags with `BITCOUNT` and combine daily cohorts using bitwise logic with `BITOP`.

## The idea

Storing boolean flags in bitmaps unlocks extraordinary analytical capabilities. Once daily active users are represented as bit arrays, computing total active users or finding users who were active across multiple days becomes pure bitwise mathematics.

Redis provides `BITCOUNT` for population counting (counting set bits) and `BITOP` to perform hardware-accelerated bitwise operations across multiple keys directly on the server.

| Operation | Command Syntax | Bitwise Logic | Example Analytics Query |
|---|---|---|---|
| **Population Count** | `BITCOUNT key [start end [BYTE\|BIT]]` | Counts total bits set to `1` | Total unique active users today |
| **Bitwise AND** | `BITOP AND dst key1 key2` | Bit is 1 if set in **both** | Users active on Monday **AND** Tuesday |
| **Bitwise OR** | `BITOP OR dst key1 key2` | Bit is 1 if set in **either** | Users active on Monday **OR** Tuesday (Weekly active) |
| **Bitwise XOR** | `BITOP XOR dst key1 key2` | Bit is 1 if set in **only one** | Users active on Monday but not Tuesday (and vice versa) |
| **Bitwise NOT** | `BITOP NOT dst key` | Inverts all bits | Inverted cohort analysis |

> **Tip:** Redis 7.0 added the `BYTE` and `BIT` specifiers to `BITCOUNT`, allowing you to count bits within precise bit or byte ranges.

## See it

Calculating daily active users and multi-day retention cohorts:

```bash
# Day 1: Users 1, 2, and 4 are active
SETBIT active:day1 1 1
SETBIT active:day1 2 1
SETBIT active:day1 4 1
# Day 2: Users 2, 3, and 4 are active
SETBIT active:day2 2 1
SETBIT active:day2 3 1
SETBIT active:day2 4 1

# Count total active users on Day 1
BITCOUNT active:day1
# (integer) 3

# Cohort Analysis: Find users active on BOTH Day 1 AND Day 2 (Retention)
BITOP AND active:both_days active:day1 active:day2
BITCOUNT active:both_days
# (integer) 2 (Users 2 and 4!)

# Find total unique users across the 2-day period (Union)
BITOP OR active:two_day_total active:day1 active:day2
BITCOUNT active:two_day_total
# (integer) 4 (Users 1, 2, 3, and 4)
```

`BITOP` writes the resulting bit array directly to the destination key on the server without transferring payloads back to the client.

## Go deeper

`BITCOUNT` is implemented using modern SIMD (Single Instruction, Multiple Data) processor instructions (such as AVX-512 and POPCNT), enabling it to scan millions of bits per millisecond.

The `BITPOS key bit [start [end]]` command returns the position of the first bit set to `0` or `1`, making it useful for finding the next available slot in an allocation pool.

## Watch out

- In older Redis versions, range arguments in `BITCOUNT` operated strictly on byte indices, not bit offsets; use the `BYTE` or `BIT` flag in Redis 7+.
- Running `BITOP` across multiple large keys can block the single thread; schedule batch analytics appropriately.

## Remember

- `BITCOUNT` counts bits set to 1 in sub-millisecond time using hardware CPU instructions.
- `BITOP` applies `AND`, `OR`, `XOR`, and `NOT` bitwise logic across multiple bitmaps.
- Server-side bitwise cohorts calculate multi-day retention and active reach at massive scale.
