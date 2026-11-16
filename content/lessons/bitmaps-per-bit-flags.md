---
slug: bitmaps-per-bit-flags
title: "Bitmaps: Compact Boolean Flags with SETBIT and GETBIT"
topic: advanced-data-types
kind: technique
summary: Track millions of binary user flags in tiny memory footprints using string bit operations SETBIT and GETBIT.
tags:
  - bitmaps
  - setbit
  - getbit
  - boolean-flags
  - memory
related:
  - bitmap-analytics-bitcount-bitop
  - string-type-and-binary-safety
  - hyperloglog-concept-cardinality
---
> **In one line:** Redis Bitmaps treat string values as continuous arrays of bits, enabling dense boolean tracking at 1 bit per user.

## The idea

Imagine tracking whether 100 million users logged into your application on a given day. Storing 100 million user IDs in a standard Set or relational table requires gigabytes of memory and storage.

In Redis, a **Bitmap** is not a separate data structure; it is a set of bitwise operations applied directly to standard Redis Strings. Since a string can store up to 512 MB ($2^{32}$ bits), a single string key can track binary flags for over **4 billion distinct IDs**. Tracking daily active state for 100 million users consumes just **12 megabytes** of RAM.

| Command | Arguments | Time Complexity | Return Value |
|---|---|---|---|
| `SETBIT key offset value` | Key, bit offset integer, `0` or `1` | $O(1)$ | Original bit value stored at offset (`0` or `1`) |
| `GETBIT key offset` | Key, bit offset integer | $O(1)$ | Current bit value at offset (`0` or `1`) |
| `STRLEN key` | Key | $O(1)$ | Length in bytes of the underlying string |

> **Note:** Bit offsets are 0-indexed: offset `0` is the most significant bit of the first byte, and offset `7` is the least significant bit.

## See it

Tracking user daily login activity using bit flags:

```bash
# User 42 logs in on 2026-11-16: set bit 42 to 1
SETBIT active:2026-11-16 42 1
# Returns: (integer) 0 (previous bit was 0)

# User 105 logs in: set bit 105 to 1
SETBIT active:2026-11-16 105 1
# Returns: (integer) 0

# Check if User 42 was active today
GETBIT active:2026-11-16 42
# Returns: (integer) 1

# Check if User 99 was active today
GETBIT active:2026-11-16 99
# Returns: (integer) 0

# Check underlying string byte length
STRLEN active:2026-11-16
# Returns: (integer) 14 (14 bytes * 8 = 112 bits allocated)
```

Setting bit 105 automatically allocated only 14 bytes of memory, demonstrating dynamic on-demand bit array expansion.

## Go deeper

When setting a bit at an offset that extends beyond the current string length, Redis automatically expands the string and zero-fills the intermediate bits.

However, be cautious with sparse IDs: calling `SETBIT key 8000000000 1` immediately forces Redis to allocate 1 gigabyte of contiguous zero-filled memory in a single command, which can cause latency spikes. When user IDs are sparse or non-numeric, use Hashes or Sets instead.

## Watch out

- Large offsets on empty keys cause instantaneous multi-megabyte memory allocations.
- Bitmaps require numeric integer identifiers; arbitrary string UUIDs cannot be used directly as bit offsets.

## Remember

- Bitmaps operate directly on standard Redis Strings, scaling up to 4 billion bits per key.
- `SETBIT` and `GETBIT` manipulate individual boolean flags in constant $O(1)$ time.
- Tracking 100 million daily users in a bitmap requires only ~12 MB of RAM.
