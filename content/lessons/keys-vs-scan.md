---
slug: keys-vs-scan
title: Why KEYS is Dangerous and How to Use SCAN
topic: keys-and-strings
kind: pitfall
summary: KEYS blocks the Redis event loop on large datasets; SCAN provides safe cursor-based non-blocking iteration.
tags:
  - scan
  - keys
  - performance
  - pitfall
related:
  - keyspace-and-key-naming
  - inspecting-keys-del-exists-type
  - single-threaded-execution
---
> **In one line:** Never use `KEYS` in production; use the cursor-based `SCAN` command to iterate over keys without blocking the server.

## The idea

When developers need to find keys matching a pattern (such as `user:1001:*`), the immediate temptation is to execute `KEYS user:1001:*`. In development environments with a few dozen keys, this returns instantly.

In production environments with millions of keys, **`KEYS` is a catastrophic footgun**. `KEYS` performs a linear $O(N)$ scan across the entire keyspace dictionary while holding the single execution thread, freezing the server for seconds or minutes.

| Command | Execution Model | Time Complexity | Production Safe? |
|---|---|---|---|
| **`KEYS pattern`** | Synchronous, scans entire dictionary in one go | $O(N)$ where $N$ is total keyspace | **Never safe in production** |
| **`SCAN cursor [MATCH] [COUNT]`** | Incremental cursor iteration | $O(1)$ per step, $O(N)$ total | **Yes; safe for live servers** |

> **Watch out:** Cloud providers and production Redis deployments frequently alias or completely disable the `KEYS` command to prevent inadvertent outages.

## See it

Comparing `KEYS` and the safe cursor-based `SCAN` workflow:

```bash
# DANGEROUS: Blocks the entire Redis server until complete
# KEYS user:*

# SAFE: Non-blocking incremental iteration
# Step 1: Start scan at cursor 0
SCAN 0 MATCH user:* COUNT 10
# Returns:
# 1) "17"              <-- Next cursor
# 2) 1) "user:1001"    <-- Batch of matching keys
#    2) "user:1002"

# Step 2: Pass the returned cursor "17" into the next call
SCAN 17 MATCH user:* COUNT 10
# Returns:
# 1) "0"               <-- Cursor 0 signifies iteration is complete
# 2) 1) "user:1003"
```

Because each `SCAN` call inspects a small bucket and returns a cursor, other clients' reads and writes are processed between successive calls.

## Go deeper

`SCAN` provides a **weak consistency guarantee**:
1. Keys present throughout the entire scan from start to end are guaranteed to be returned.
2. Keys created or destroyed during iteration may or may not be returned.
3. Individual keys may occasionally be returned more than once (client applications must deduplicate if uniqueness is required).

The `COUNT` argument is a hint, not an exact limit. Passing `COUNT 100` tells Redis to inspect approximately 100 internal hash table buckets, which may yield more or fewer matching keys.

## Watch out

- Assuming `SCAN` returns an exact number of keys equal to `COUNT` is a common bug; `COUNT` is only an internal bucket hint.
- Do not forget that iteration completes only when the returned cursor equals `"0"`.

## Remember

- `KEYS` blocks the single-threaded Redis engine and should never be run in production.
- `SCAN` iterates incrementally using cursors without freezing active connections.
- The iteration sequence is complete when the returned cursor returns to 0.
