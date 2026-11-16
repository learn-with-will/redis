---
slug: hash-memory-efficiency
title: Memory Optimization with Small Hashes and Listpacks
topic: lists-and-hashes
kind: technique
summary: Slash RAM consumption by up to 80% by leveraging Redis compact listpack encoding for small hashes.
tags:
  - hashes
  - memory
  - optimization
  - listpack
related:
  - hash-structure-and-field-values
  - hash-crud-hset-hget-hdel
  - memory-diagnostics-and-usage
---
> **In one line:** Small Redis Hashes use compact listpack encoding, reducing RAM consumption by up to 80% compared to raw string keys.

## The idea

Every top-level key in Redis requires a dictionary entry containing object headers, pointer references, and metadata (typically 30–50 bytes of overhead per key). Storing 10 million small attributes as individual string keys incurs hundreds of megabytes of pointer overhead before accounting for actual data.

Redis optimizes memory for Hashes using dual internal representations:
1. **listpack** (formerly ziplist): A contiguous serialized byte buffer storing field-value pairs contiguously without memory pointers.
2. **hashtable**: A standard hash table utilizing pointer structures for fast $O(1)$ lookups on large collections.

| Configuration Directive | Default Threshold | Description |
|---|---|---|
| `hash-max-listpack-entries` | 128 | Maximum number of fields before converting to a hashtable |
| `hash-max-listpack-value` | 64 | Maximum byte length of any single field/value before conversion |

> **Tip:** As long as a Hash stays within these configuration thresholds, it uses the compact `listpack` encoding, dramatically reducing memory fragmentation.

## See it

Verifying the internal memory encoding of a Hash in `redis-cli`:

```bash
# Create a small hash
HSET device:101 model "SensNode-V2" temp "22.4" battery "98"

# Inspect the internal encoding
OBJECT ENCODING device:101
# Returns: "listpack"

# Query the exact memory consumed in bytes
MEMORY USAGE device:101
# Returns: (integer) 88

# Add a field that exceeds the 64-byte threshold:
HSET device:101 description "This is a very long device description string that exceeds the sixty-four byte threshold limit."

# Inspect encoding after exceeding limit:
OBJECT ENCODING device:101
# Returns: "hashtable"
```

Once a hash exceeds either the entry count or value length threshold, Redis permanently converts it to a standard `hashtable` for performance.

## Go deeper

Because a `listpack` is a contiguous array, querying fields involves a fast linear memory scan. For small collections (under 128 entries), CPU cache line locality makes linear scans faster than traversing pointers in a hash table.

Engineers frequently leverage this by **bucketing**: grouping millions of individual entities into numbered hashes (e.g., entity `100234` is stored as field `234` inside key `bucket:1000`). This technique frequently reduces database memory footprints by 60% to 80%.

## Watch out

- Setting `hash-max-listpack-entries` too high (e.g., 5,000) causes CPU spikes because linear scans over large byte buffers become expensive.
- Once a hash converts from `listpack` to `hashtable`, Redis will not automatically convert it back even if fields are deleted.

## Remember

- Small hashes use contiguous `listpack` encoding, eliminating pointer overhead.
- Dual encoding transitions automatically when thresholds (`entries > 128` or `value > 64B`) are crossed.
- Bucketing individual keys into small hashes can reduce total memory usage by up to 80%.
