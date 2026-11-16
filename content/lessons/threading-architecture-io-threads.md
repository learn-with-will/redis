---
slug: threading-architecture-io-threads
title: Threading Architecture and I/O Threads
topic: security-and-operations
kind: concept
summary: Understand Redis 6+ multi-threaded I/O, how the command execution core remains single-threaded, and configuration.
tags:
  - threading
  - io-threads
  - architecture
  - performance
related:
  - single-threaded-execution
  - pipelining-rtt-reduction
---
> **In one line:** Redis uses background threads for socket network I/O while keeping command execution strictly single-threaded.

## The idea
A long-standing tenet of Redis is its single-threaded execution model, which eliminates lock contention and race conditions. However, on modern 100Gbps network interfaces, reading bytes from sockets and parsing RESP protocol payloads can saturate a single CPU core before memory execution is even reached.

Starting with **Redis 6**, threaded I/O was introduced. Redis delegates socket reading, RESP parsing, and socket writing to background worker threads, while the core command execution engine remains single-threaded and strictly thread-safe.

```text
[Network Sockets] ---> [I/O Thread 1] ---> RESP Parser
                 ---> [I/O Thread 2] ---> RESP Parser
                                                 |
[Single-Threaded Execution Core] <---------------+ (Executes SET, GET, etc.)
               |
               +----> [I/O Threads] -------------> [Write Replies to Sockets]
```

## See it
Enable and tune multi-threaded I/O in `redis.conf`:

```text
# Number of I/O threads (set to CPU cores minus 1 or 2)
# Recommended: 4 threads on 8-core machines; 8 threads on 16-core machines
io-threads 4

# By default, I/O threads only handle writing replies to sockets.
# Enable threaded reading to offload RESP payload parsing as well:
io-threads-do-reads yes
```

Verify thread allocation via Linux process inspection tools:

```bash
# Check worker threads spawned by the redis-server process
$ ps -eLo pid,tid,class,rtprio,ni,pri,psr,pcpu,stat,wchan:14,comm | grep redis-server

# Inspect client buffer memory with threads active
127.0.0.1:6379> INFO memory
mem_fragmentation_ratio:1.15
```

## Go deeper
Threaded I/O is disabled by default (`io-threads 1`). In most workloads, a single Redis core can handle 100,000+ operations per second effortlessly. Enabling I/O threads is recommended only when benchmarks show CPU utilization near 100% on the main thread and profiling confirms network I/O or protocol serialization bottlenecks.

When threaded I/O is enabled, the main thread orchestrates socket assignments across the worker threads during the event loop cycle. The worker threads process network buffers in lock-step batches before the main thread executes the parsed commands atomically in RAM. Because commands never run concurrently on worker threads, your Lua scripts, transactions, and data structures maintain absolute thread-safety without locks.

> **Note:** Threaded I/O never executes Redis commands concurrently. It only speeds up reading bytes from network sockets and writing serialized buffers back to clients.

## Watch out
* Setting `io-threads` higher than the number of available physical CPU cores degrades performance due to excessive context switching.
* `io-threads-do-reads yes` should only be enabled when request payloads are large and network throughput is high.

## Remember
* Redis uses multi-threading strictly for socket network I/O and protocol serialization.
* Command execution remains single-threaded, preserving lock-free atomicity and deterministic state.
* Only enable `io-threads` when CPU profiling reveals network socket saturation on high-throughput nodes.
