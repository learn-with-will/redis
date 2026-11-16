---
slug: capped-streams-xtrim
title: Bounding Stream Storage with Capped Streams and XTRIM
topic: messaging-and-streams
kind: technique
summary: Prevent unbounded memory growth by trimming streams using XTRIM and approximate MAXLEN modifiers.
tags:
  - streams
  - xtrim
  - maxlen
  - memory
  - capped
related:
  - stream-data-type-and-append-log
  - appending-and-reading-streams
  - capped-lists-with-ltrim
---
> **In one line:** Keep Redis Streams bounded to a maximum size using `XTRIM` or the `MAXLEN ~` argument in `XADD`.

## The idea

Unlike Redis Lists where items are popped and deleted from memory, reading entries from a Redis Stream with `XREAD` or `XREADGROUP` does **not** delete the data. The stream remains an append-only log that grows continuously with every write.

In high-throughput event streaming systems processing thousands of events per second, an untrimmed stream will eventually consume all available server RAM.

Redis provides two primary mechanisms to constrain stream size:
1. **Trimming during insertion:** Passing `MAXLEN` or `MINID` directly to `XADD`.
2. **Periodic administrative trimming:** Running the standalone `XTRIM` command.

| Trimming Strategy | Syntax Example | Efficiency | Mechanism |
|---|---|---|---|
| **Exact Count** | `XTRIM stream MAXLEN 1000` | Slower ($O(N)$) | Exactly 1,000 entries retained; splits memory listpacks |
| **Approximate Count** | `XTRIM stream MAXLEN ~ 1000` | **Fastest ($O(1)$)** | Frees whole internal listpack blocks; retains roughly ~1000 entries |
| **By Minimum ID / Time** | `XTRIM stream MINID ~ 1700000000000` | **Fastest ($O(1)$)** | Drops events older than specified timestamp threshold |

> **Tip:** Always use the tilde (`~`) operator for approximate trimming. It is dramatically faster because it only purges whole internal listpack nodes rather than splitting memory pages.

## See it

Constraining stream memory using approximate trimming:

```bash
# Append an event and trim stream to approximately 100,000 entries in one call
XADD events:log MAXLEN ~ 100000 * service "auth" action "login" user "42"

# Run periodic cleanup to retain approximately the latest 5,000 events
XTRIM events:log MAXLEN ~ 5000
# Returns: (integer) 1240 (Number of entries purged from memory)

# Time-based trimming: Purge events older than 7 days ago
# (Specify millisecond epoch timestamp)
XTRIM events:log MINID ~ 1762716800000

# Inspect remaining entry count
XLEN events:log
# Returns: (integer) 5042 (Approximate count close to target!)

# Check memory footprint after trimming
MEMORY USAGE events:log
# Returns exact byte allocation of trimmed stream
```

Using `MAXLEN ~` adds virtually zero CPU overhead to incoming `XADD` operations.

## Go deeper

Because Redis Streams store entries inside a radix tree of compressed `listpacks` (typically holding ~100 entries per node), exact trimming (`MAXLEN 1000`) forces Redis to unpack a listpack, slice individual entries out of memory, and repack it.

In contrast, approximate trimming (`MAXLEN ~ 1000`) simply drops entire listpack nodes from the tree without re-encoding, executing in constant $O(1)$ time. This difference is critical for high-throughput messaging pipelines processing tens of thousands of telemetry events per second.

## Watch out

- Using exact `MAXLEN` without `~` in high-throughput `XADD` loops introduces significant CPU latency spikes.
- Trimming a stream does not reset or delete unacknowledged entries in consumer group PELs; acknowledge messages before trimming.

## Remember

- Streams do not delete events upon delivery and will consume unbounded RAM unless trimmed.
- Use `MAXLEN ~ <count>` in `XADD` to cap stream length efficiently during ingestion.
- The `~` approximate operator discards whole memory listpacks in constant $O(1)$ time.
