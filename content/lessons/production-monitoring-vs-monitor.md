---
slug: production-monitoring-vs-monitor
title: Production Monitoring vs. MONITOR
topic: security-and-operations
kind: pitfall
summary: Avoid catastrophic production outages caused by MONITOR and use safe alternatives like CLIENT LIST and slowlog.
tags:
  - monitor
  - debugging
  - pitfall
  - production
related:
  - monitoring-with-info-sections
  - identifying-slow-queries-slowlog
---
> **In one line:** Never run MONITOR in a production environment; it degrades server throughput by over 50% and consumes massive memory.

## The idea
Redis provides the `MONITOR` command, which streams every single command processed by the server in real time. It is a popular debugging tool during local development because you can watch application commands flash across the terminal as you click through a web interface.

However, in a production environment handling thousands of requests per second, running `MONITOR` can cause immediate catastrophic performance degradation.

| Diagnostic Method | Production Safe? | Throughput Impact | Mechanism |
| :--- | :--- | :--- | :--- |
| **MONITOR** | **NO (Dangerous)** | >50% throughput drop | Streams all commands over client socket buffer |
| **SLOWLOG** | **YES** | Negligible (<1%) | In-memory circular buffer for slow commands |
| **LATENCY DOCTOR** | **YES** | Zero | Analyzes internal engine latency engine spikes |

## See it
Observe the stream of commands produced by `MONITOR` on a test instance:

```bash
# Debugging on local development machine only!
127.0.0.1:6379> MONITOR
OK
1620002100.123456 [0 127.0.0.1:52134] "GET" "session:abc"
1620002100.123890 [0 127.0.0.1:52134] "SET" "session:abc" "active"
1620002100.124110 [0 127.0.0.1:52135] "INCR" "metrics:counter"
^C
```

Safe production alternative: check client load and slow commands without streaming:

```bash
# Safe inspection of active connections
127.0.0.1:6379> CLIENT LIST
id=4 addr=127.0.0.1:51234 name=web-1 age=3600 idle=0 flags=N cmd=get

# Safe check of recent engine latency
127.0.0.1:6379> LATENCY LATEST

# Check instant ops per second safely via INFO
127.0.0.1:6379> INFO stats
instantaneous_ops_per_sec:24500
```

## Go deeper
Why does `MONITOR` crush performance? 
1. Every command executed by the single-threaded engine must be formatted into a string and copied into the output buffer of the monitoring client connection.
2. If the terminal reading `MONITOR` cannot consume text as fast as Redis generates it, the server's output buffer balloons, consuming gigabytes of RAM until the server crashes or evicts data.

Production observability must always use passive sampling rather than invasive streaming. Modern telemetry tools scrape the Redis Prometheus exporter every 10 to 15 seconds. This approach extracts point-in-time counters with virtually zero performance overhead, leaving Redis free to serve application requests.

> **Tip:** You can use `rename-command MONITOR ""` in `redis.conf` to prevent junior developers or external scripts from accidentally executing `MONITOR` in production.

## Watch out
* Even a 5-second execution of `MONITOR` on a 50,000 ops/sec cluster can trigger memory spikes and client timeouts.
* Client output buffer limits (`client-output-buffer-limit pubsub`) may terminate slow monitor connections, but not before latency has spiked.

## Remember
* `MONITOR` streams every processed command, slashing server throughput by more than half.
* Unconsumed monitor streams exhaust Redis memory via bloated client output buffers.
* Use `SLOWLOG`, `INFO`, and metric collectors for safe production observability.
