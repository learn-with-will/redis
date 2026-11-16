---
slug: capped-lists-with-ltrim
title: Building Capped Collections with LTRIM
topic: lists-and-hashes
kind: technique
summary: Keep lists bounded to a fixed maximum size by combining LPUSH with LTRIM to build high-performance capped buffers.
tags:
  - lists
  - ltrim
  - capped-collections
  - patterns
related:
  - list-data-structure-basics
  - list-range-and-inspection
  - capped-streams-xtrim
---
> **In one line:** Bounding lists with `LTRIM` creates fixed-capacity buffers like "latest 100 log entries" without unbounded memory growth.

## The idea

In production systems, lists that track event histories, audit logs, or recent visitor activity will grow indefinitely unless actively constrained. Over months of operation, an unbounded list consumes gigabytes of memory and degrades performance.

Redis solves this with the `LTRIM` command. `LTRIM` removes all elements *outside* the specified index boundaries, shrinking the list in-place so only the desired window of elements remains.

| Operation Sequence | Command | Effect on List State |
|---|---|---|
| **1. Insert Newest Item** | `LPUSH events:log "new_event"` | Adds new element at index 0 (head) |
| **2. Trim Unwanted Tail** | `LTRIM events:log 0 99` | Retains indices 0..99; discards everything beyond index 99 |
| **3. Query Current Size** | `LLEN events:log` | Bounded strictly to <= 100 elements |

> **Tip:** Executing `LPUSH` immediately followed by `LTRIM` forms the canonical Redis pattern for implementing fixed-size "latest-N" collections.

## See it

Maintaining a capped buffer of the 5 most recent user transactions:

```bash
# Seed initial transaction items
RPUSH user:42:recent_tx "tx_1" "tx_2" "tx_3" "tx_4" "tx_5"

# A new transaction occurs; push to the head
LPUSH user:42:recent_tx "tx_6"

# Trim the list to strictly hold the 5 latest items (indices 0 through 4)
LTRIM user:42:recent_tx 0 4
# Returns: OK

# Inspect the retained elements
LRANGE user:42:recent_tx 0 -1
# Returns:
# 1) "tx_6"
# 2) "tx_1"
# 3) "tx_2"
# 4) "tx_3"
# 5) "tx_4"
# (Notice "tx_5" was cleanly discarded)
```

The oldest element (`tx_5`) was evicted, keeping the memory allocation strictly bounded.

## Go deeper

`LTRIM` executes in $O(N)$ time where $N$ is the number of elements being removed from the list. When removing a single element during steady-state `LPUSH` + `LTRIM` cycles, the trim executes virtually instantly in $O(1)$ time because only one memory node is reclaimed.

To ensure both commands execute without race conditions from concurrent workers or network failures, wrap them in a `MULTI`/`EXEC` transaction block or a lightweight Lua script. Capped collections are widely used for maintaining recent search histories, error traces, and active user audits.

## Watch out

- Reversing the indices in `LTRIM` (e.g., `LTRIM key 10 5`) empties the list completely, deleting all elements.
- Forgetting to trim active event lists leads to memory exhaustion over long operational lifetimes.

## Remember

- `LTRIM` trims lists to retain only elements within the specified `start` and `stop` range.
- Pairing `LPUSH` with `LTRIM 0 (N-1)` creates a capped collection of size $N$.
- Trimming prevents unbounded memory consumption in logging and event tracking use cases.
