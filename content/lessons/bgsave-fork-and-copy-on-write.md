---
slug: bgsave-fork-and-copy-on-write
title: Understanding BGSAVE, fork(), and Linux Copy-on-Write
topic: persistence-and-durability
kind: concept
summary: Master the Linux fork() system call, memory allocation, and Copy-on-Write dynamics during BGSAVE operations.
tags:
  - bgsave
  - copy-on-write
  - fork
  - linux
  - memory
related:
  - rdb-snapshots-save-bgsave
  - configuring-maxmemory
  - memory-diagnostics-and-usage
---
> **In one line:** `BGSAVE` relies on Linux `fork()` and Copy-on-Write (CoW) to snapshot memory without duplicating full RAM allocations.

## The idea

How can Redis write a 20 GB database to disk while simultaneously accepting 50,000 writes per second without locking or corrupting memory?

The secret lies in the Linux kernel system call **`fork()`** and the virtual memory mechanism known as **Copy-on-Write (CoW)**.
1. When `BGSAVE` runs, the parent Redis process invokes `fork()`.
2. The operating system creates a child process that shares the **exact same physical memory pages** as the parent process. The fork operation takes only a few milliseconds.
3. As long as neither process modifies a memory page, both share the same physical RAM without duplicating data.
4. When the parent process writes to a key, the OS creates a duplicate copy of *only that specific 4 KB memory page* for the parent to modify. The child continues reading the original untouched page.

| Process | Role | Memory Behavior |
|---|---|---|
| **Parent Process** | Serves client commands | Mutates copied pages; clients experience zero latency |
| **Child Process** | Serializes dump to disk | Reads original frozen memory pages until dump concludes |
| **Operating System** | Duplicates pages on write | Allocates private memory pages only when keys are modified |

> **Note:** Because only modified memory pages are duplicated, a 20 GB Redis instance under moderate write traffic typically consumes only 500 MB to 2 GB of extra RAM during a snapshot.

## See it

Checking memory overhead during background saving in `redis-cli`:

```bash
# Check memory metrics related to persistence forks
INFO persistence
# Look for:
# latest_fork_usec:1420          <-- Time taken to execute fork() in microseconds
# rdb_last_cow_size:104857600    <-- Extra RAM duplicated during snapshot (100 MB)

# Check operating system virtual memory setting on Linux:
# In bash terminal:
cat /proc/sys/vm/overcommit_memory
# Should return: 1
```

A `latest_fork_usec` value below 10,000 microseconds (10ms) indicates healthy kernel page table cloning.

## Go deeper

Operating System Tuning for Redis:
- **`vm.overcommit_memory = 1`:** Linux kernels default to heuristic memory overcommit. If Redis consumes 12 GB on a 16 GB server, the kernel may reject `fork()` fearing memory exhaustion. Setting overcommit to `1` forces the kernel to allow the fork, knowing Copy-on-Write will only duplicate a small fraction of pages.
- **Disable Transparent Huge Pages (THP):** Linux THP allocates memory in large 2 MB chunks instead of standard 4 KB pages. When THP is enabled, modifying one 10-byte string forces the kernel to duplicate an entire 2 MB page, causing severe memory bloat and latency spikes during `BGSAVE`.

## Watch out

- Heavy write traffic during `BGSAVE` forces rapid page duplication, causing memory usage to spike.
- Leaving Transparent Huge Pages (THP) enabled in the Linux kernel degrades persistence performance.

## Remember

- `BGSAVE` forks a child process that shares parent memory pages via Copy-on-Write.
- Only memory pages modified during the snapshot are duplicated.
- Set `vm.overcommit_memory = 1` and disable Transparent Huge Pages (THP) in the host kernel.
