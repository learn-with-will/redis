---
slug: configuring-maxmemory
title: Bounding Memory Usage with the maxmemory Directive
topic: expiration-and-memory
kind: technique
summary: Prevent operating system Out-Of-Memory process crashes by setting strict memory bounds with the maxmemory directive.
tags:
  - maxmemory
  - memory
  - configuration
  - devops
related:
  - eviction-policies-overview
  - lru-vs-lfu-sampling-algorithms
  - memory-diagnostics-and-usage
---
> **In one line:** Set `maxmemory` in `redis.conf` or via `CONFIG SET` to cap RAM consumption and avoid Out-Of-Memory OS crashes.

## The idea

By default on 64-bit operating systems, Redis launches without a memory ceiling (`maxmemory 0`), allowing it to consume as much physical RAM as the host operating system provides.

If memory grows unchecked, the host kernel triggers the dreaded **OOM (Out-Of-Memory) Killer**, abruptly terminating the Redis process and dropping all unpersisted client data. Setting an explicit `maxmemory` limit prevents kernel panics by telling Redis when to begin evicting old keys or refusing new writes.

| Host Server RAM | Recommended `maxmemory` | Purpose of Headroom |
|---|---|---|
| **4 GB Host** | `maxmemory 2.5GB` | Headroom for OS, network buffers, and BGSAVE forks |
| **16 GB Host** | `maxmemory 11GB` | 5 GB buffer for copy-on-write during persistence snapshots |
| **64 GB Host** | `maxmemory 48GB` | Headroom for large client replication buffers and query processing |

> **Important:** Never allocate 100% of physical host RAM to `maxmemory`; background persistence forks (`BGSAVE`) and replication buffers require substantial memory headroom.

## See it

Inspecting and adjusting `maxmemory` at runtime via `redis-cli`:

```bash
# Query the current memory ceiling (in bytes)
CONFIG GET maxmemory
# Returns:
# 1) "maxmemory"
# 2) "0" (Unbounded default!)

# Configure a 2 Gigabyte ceiling at runtime without restarting
CONFIG SET maxmemory 2gb
# Returns: OK

# Verify the updated limit
CONFIG GET maxmemory
# Returns:
# 1) "maxmemory"
# 2) "2147483648"

# Check human-readable memory metrics
INFO memory
# Shows used_memory_human and maxmemory_human
```

Using `CONFIG SET maxmemory` takes effect instantly without dropping existing client TCP connections.

## Go deeper

Memory limits can be specified in standard human-friendly units in `redis.conf`:
- `100mb`, `2gb`, `500k`.

When `used_memory` reaches `maxmemory`, Redis activates its configured **eviction policy** (`maxmemory-policy`). If the policy fails to free enough memory or is set to `noeviction`, subsequent write commands (such as `SET`, `HSET`, `LPUSH`) fail with an `-OOM command not allowed when used memory > 'maxmemory'` error, while read-only commands (`GET`, `HGET`) continue executing normally.

## Watch out

- Running with `maxmemory 0` in production risks server termination by the operating system OOM killer.
- Failing to leave sufficient host memory headroom for copy-on-write forks causes memory exhaustion during snapshots.

## Remember

- The `maxmemory` directive caps total physical RAM allocated to Redis keys.
- Allocate 25%–35% host memory headroom for background persistence, replication, and OS processes.
- Modify memory limits live using `CONFIG SET maxmemory <size>` without restarting.
