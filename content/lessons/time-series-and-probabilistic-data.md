---
slug: time-series-and-probabilistic-data
title: Time Series and Extended Probabilistic Data Structures
topic: advanced-data-types
kind: technique
summary: Ingest millions of time-series samples and query Bloom and Cuckoo filters natively in Redis 8.
tags:
  - timeseries
  - bloom-filter
  - probabilistic
  - redis-8
related:
  - redis-json-document-storage
  - query-engine-secondary-indexing
  - bitmaps-per-bit-flags
---
> **In one line:** Ingest time-series metrics with `TS.ADD` and perform fast set-membership filtering using Bloom and Cuckoo filters.

## The idea

Modern applications require specialized data engines for metrics ingestion, IoT telemetry, and high-speed fraud detection. In Redis 8, the former Redis Stack capabilities are bundled into core open-source Redis, adding two critical families of data structures:

1. **Redis TimeSeries:** Optimized append-only time-series storage with downsampling, compaction rules, and range aggregations (`TS.ADD`, `TS.RANGE`).
2. **Probabilistic Data Structures:** Bloom Filters (`BF.ADD`, `BF.EXISTS`), Cuckoo Filters (`CF.ADD`), Count-Min Sketch (`CMS.INCRBY`), and Top-K for stream analytics.

| Engine / Structure | Core Commands | Primary Use Case | Advantage |
|---|---|---|---|
| **Redis TimeSeries** | `TS.ADD`, `TS.RANGE`, `TS.MRANGE` | Server metrics, CPU monitoring, IoT telemetry | Built-in rollups (avg, sum, max) and double-delta compression |
| **Bloom Filter** | `BF.ADD`, `BF.EXISTS`, `BF.MADD` | Username reservation, cache penetration defense | False positives possible; zero false negatives; ultra-compact |
| **Cuckoo Filter** | `CF.ADD`, `CF.EXISTS`, `CF.DEL` | Dynamic membership testing with deletions | Allows member deletions unlike standard Bloom filters |

> **Note:** A Bloom Filter guarantees that if `BF.EXISTS` returns `0`, the element was **definitely never added**.

## See it

Ingesting time-series telemetry and checking Bloom filter membership:

```bash
# Create a TimeSeries for CPU utilization
TS.CREATE sensor:cpu:node_1 RETENTION 86400000 LABELS metric "cpu" host "node_1"

# Ingest sample: Timestamp (ms) and Metric Value
TS.ADD sensor:cpu:node_1 1700000000000 45.2
TS.ADD sensor:cpu:node_1 1700000060000 48.7
TS.ADD sensor:cpu:node_1 1700000120000 52.1

# Query average CPU across a 1-hour time window with 1-minute bucket aggregation
TS.RANGE sensor:cpu:node_1 1700000000000 1700000120000 AGGREGATION avg 60000

# Using a Bloom Filter to prevent cache penetration for invalid usernames
BF.ADD reserved_usernames "admin"
BF.ADD reserved_usernames "root"
BF.ADD reserved_usernames "system"

# Check if username exists
BF.EXISTS reserved_usernames "admin"
# Returns: (integer) 1

BF.EXISTS reserved_usernames "guest_user"
# Returns: (integer) 0 (Definitely does not exist!)
```

`TS.RANGE` calculates statistical rollups directly inside Redis without shipping thousands of raw samples across the network.

## Go deeper

**Bloom Filters** use multiple independent hash functions to map strings into a bit array. Because hash collisions can occur, a Bloom filter may occasionally report that an element exists when it does not (a **false positive**), but it will never falsely report that an existing element is missing.

By configuring error rate tolerances (`BF.RESERVE key error_rate capacity`), you can control the accuracy versus memory footprint.

## Watch out

- Once a Bloom filter is created, members cannot be deleted; use a Cuckoo Filter (`CF.DEL`) if element removal is required.
- Configure retention periods on TimeSeries keys (`RETENTION <ms>`) to avoid infinite memory growth.

## Remember

- Redis TimeSeries ingests and aggregates high-frequency metric streams directly in memory.
- Bloom Filters offer memory-efficient membership tests with zero false negatives.
- Cuckoo Filters extend Bloom filters by supporting element deletion.
