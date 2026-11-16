---
slug: memory-diagnostics-and-usage
title: Analyzing Memory Footprint with MEMORY USAGE and DOCTOR
topic: expiration-and-memory
kind: tool
summary: Diagnose memory consumption, identify large keys, and detect fragmentation using MEMORY USAGE and MEMORY DOCTOR.
tags:
  - memory-usage
  - memory-doctor
  - diagnostics
  - tool
related:
  - configuring-maxmemory
  - eviction-policies-overview
  - common-anti-patterns-and-when-not-to-use
---
> **In one line:** Inspect exact byte allocations with `MEMORY USAGE` and diagnose server health with `MEMORY DOCTOR`.

## The idea

Managing memory efficiently requires visibility into where RAM is actually being spent. Are 10 million small strings consuming your memory? Did a developer store an uncompressed 50 MB JSON document under a single key? Or is memory fragmentation wasting available capacity?

Redis provides a suite of specialized memory diagnostic commands under the `MEMORY` family to inspect allocations, measure individual keys, and debug fragmentation.

| Command | Arguments | Time Complexity | Purpose |
|---|---|---|---|
| `MEMORY USAGE key [SAMPLES count]` | Key | $O(N)$ for collections | Reports total bytes allocated for a key and its values |
| `MEMORY DOCTOR` | None | $O(1)$ | Generates human-readable diagnostic report on memory health |
| `MEMORY STATS` | None | $O(1)$ | Detailed breakdown of engine allocations, buffers, and metadata |
| `MEMORY PURGE` | None | Depends on allocator | Requests jemalloc to release clean memory pages back to OS |

> **Tip:** By default, `MEMORY USAGE` samples 5 elements in collections to approximate size; pass `SAMPLES 0` to sample every element for absolute precision.

## See it

Inspecting memory allocations and running memory diagnostics in `redis-cli`:

```bash
# Create sample data structures
SET simple:counter "100"
HSET user:profile:10 name "Alexander" role "Lead Engineer" email "alex@work.org"

# Check exact memory footprint in bytes
MEMORY USAGE simple:counter
# Returns: (integer) 56

MEMORY USAGE user:profile:10
# Returns: (integer) 128

# Run automated diagnostic doctor
MEMORY DOCTOR
# Output:
# Hi Sam, I can't find any issue in your instance. I can only say that memory look good!

# Check memory fragmentation ratio from INFO
INFO memory
# Look for: mem_fragmentation_ratio:1.15
```

A healthy `mem_fragmentation_ratio` typically hovers between `1.0` and `1.5`.

## Go deeper

A critical metric in `INFO memory` is **`mem_fragmentation_ratio`** (`used_memory_rss / used_memory`):
- **Ratio between 1.0 and 1.5:** Healthy memory utilization.
- **Ratio > 1.5:** Excessive fragmentation; the operating system allocated physical memory pages that Redis memory allocator (jemalloc) has not compacted.
- **Ratio < 1.0:** The operating system is swapping Redis memory to disk swap space, leading to severe latency degradation.

Modern Redis includes an active defragmentation engine (`activedefrag yes`) that automatically cleans up fragmented memory pages in the background.

## Watch out

- Calling `MEMORY USAGE` on massive collections with `SAMPLES 0` can block the single-threaded engine.
- A fragmentation ratio below 1.0 indicates your host is out of RAM and swapping to disk.

## Remember

- `MEMORY USAGE <key>` calculates the exact byte footprint of any key and its contents.
- `MEMORY DOCTOR` provides immediate diagnostic advice on memory anomalies and configuration errors.
- Active defragmentation compacts memory fragmentation in the background without restarting.
