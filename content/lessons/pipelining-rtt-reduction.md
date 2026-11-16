---
slug: pipelining-rtt-reduction
title: Pipelining and RTT Reduction
topic: security-and-operations
kind: technique
summary: Slash round-trip network latency by batching independent Redis commands without waiting for immediate replies.
tags:
  - pipelining
  - rtt
  - performance
  - batching
related:
  - single-threaded-execution
  - the-resp-protocol
---
> **In one line:** Pipelining batches multiple commands into a single network socket write, dramatically reducing round-trip latency overhead.

## The idea
Redis is capable of executing tens of thousands of operations per second, but network round-trip time (RTT) often becomes the primary bottleneck. If the network RTT between the application server and Redis is 1ms, a synchronous loop sending 1,000 commands sequentially will take 1,000ms (1 second), even if Redis executes each command in microseconds.

**Pipelining** solves this by sending multiple commands without waiting for each response, then reading all responses in a single read phase.

| Execution Mode | Socket Round-Trips for 1,000 Commands | Relative Latency |
| :--- | :--- | :--- |
| **Sequential Requests** | 1,000 round-trips | High (~1,000ms over 1ms RTT) |
| **Pipelined Batch** | 1 or few round-trips | Low (~2ms over 1ms RTT) |

## See it
Test pipelining directly via `redis-cli --pipe` using standard raw RESP protocol streams:

```bash
# Generate 10,000 sample SET commands and pipe them in bulk
(for i in $(seq 1 10000); do
  echo -e "SET user:key:$i value_$i"
done) | redis-cli --pipe

# Output confirms bulk batching efficiency
All data transferred. Waiting for the last reply...
Last reply received from server.
errors: 0, replies: 10000

# Benchmark pipelined operations vs unpipelined
redis-benchmark -q -n 100000 -c 50 -P 16 -t set,get

# Inspect raw socket pipelining metrics
127.0.0.1:6379> INFO stats
total_commands_processed:100000
```

## Go deeper
Pipelining works at the transport layer of the client library. While the client transmits command 2, command 3, and command 4, the Redis server reads them sequentially from the socket buffer and executes them one after another.

Redis buffers responses in output client buffers until the entire batch has completed execution. This means pipelining differs fundamentally from transactions: pipelined commands are not atomic, and commands from other clients may interleave between pipelined commands unless wrapped inside `MULTI`/`EXEC`.

Furthermore, pipelining dramatically reduces operating system syscall overhead. Without pipelining, sending 10,000 commands involves 10,000 `write()` and 10,000 `read()` system calls, causing 20,000 context switches between user space and kernel space. With pipelining, the operating system can satisfy the batch with just a handful of large socket transfers.

> **Tip:** Do not batch an infinite number of commands into a single pipeline. Batch sizes between 100 and 1,000 commands generally maximize throughput without exhausting socket memory buffers.

## Watch out
* Extremely large pipelines consume significant RAM in the Redis server's client output buffer (`client-output-buffer-limit`).
* If one command inside a pipeline fails, subsequent pipelined commands still execute normally.

## Remember
* Pipelining batches requests over a single socket to bypass per-command network RTT delays.
* Pipelined commands are not atomic and may interleave with operations from other clients.
* Cap pipeline batch sizes (typically 100 to 1,000 items) to prevent client buffer memory exhaustion.
