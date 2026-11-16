---
slug: client-connection-management
title: Client Connection Management and Timeouts
topic: security-and-operations
kind: tool
summary: Inspect connection limits with maxclients, monitor active connections using CLIENT LIST, and kill leaked sockets.
tags:
  - client-list
  - maxclients
  - connections
  - timeouts
related:
  - single-threaded-execution
  - monitoring-with-info-sections
---
> **In one line:** Manage client pools, configure idle socket timeouts, and inspect connected clients using CLIENT LIST and CLIENT KILL.

## The idea
Every open network connection to Redis consumes file descriptors and server memory. If client applications create new connections without pooling or leave abandoned sockets open, Redis can exhaust its file descriptor limit (`maxclients`, default 10,000), causing connection refusals for all services.

Effective client connection management involves setting connection limits, configuring idle connection timeouts, and using `CLIENT` administrative commands to inspect and clean up connections.

| Directive | Purpose | Recommended Setting |
| :--- | :--- | :--- |
| `maxclients` | Maximum simultaneous open client sockets | 10000+ (aligned with OS `ulimit -n`) |
| `timeout` | Close idle client connections after N seconds | 300 (0 means never close) |
| `tcp-keepalive` | Detect dead peer sockets using TCP ACK probes | 300 seconds |

## See it
Inspect and manage connected clients dynamically with `redis-cli`:

```bash
# Inspect all connected clients and their active queries
127.0.0.1:6379> CLIENT LIST
id=12 addr=10.0.1.25:49152 fd=8 name=worker-pool age=7200 idle=0 flags=N db=0 sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=20480 argv-mem=10 obl=0 oll=0 omem=0 events=r cmd=get user=default

# Filter connections by client type (normal, master, replica, pubsub)
127.0.0.1:6379> CLIENT LIST TYPE normal

# Terminate an unresponsive or leaking client connection by ID
127.0.0.1:6379> CLIENT KILL ID 12
(integer) 1

# Terminate all connections from a specific remote IP
127.0.0.1:6379> CLIENT KILL 10.0.1.25:49152
OK

# Assign a human-readable name to the current connection
127.0.0.1:6379> CLIENT SETNAME "payment-gateway-pool"
OK
```

## Go deeper
Examining the fields in `CLIENT LIST` provides key operational insights:
* `age`: Seconds the connection has been open.
* `idle`: Seconds the connection has been inactive.
* `qbuf` and `qbuf-free`: Input query buffer sizes.
* `omem`: Memory used by the client output buffer. If this is high, the client is not reading replies quickly enough.

Setting names on connections with `CLIENT SETNAME` is an industry best practice. When debugging connection spikes during incidents, naming connection pools by application service allows you to instantly isolate which microservice is leaking sockets or monopolizing worker threads.

Additionally, monitor `rejected_connections` in `INFO stats`. If this counter increments above zero, clients are failing to connect because the instance has hit its `maxclients` ceiling, indicating an urgent need to expand pooling limits or resolve socket leaks.

> **Tip:** Always use connection pooling in application code (e.g. HikariCP, GenericContainerPool). Avoid creating a fresh Redis connection per HTTP request.

## Watch out
* Setting `timeout 0` allows leaked TCP connections from crashed application workers to stay open indefinitely.
* Ensure the host operating system's `nofile` limit (`ulimit -n`) is set higher than `maxclients` + 32.

## Remember
* `CLIENT LIST` exposes connected clients, memory usage, idle duration, and current commands.
* Configure `timeout` and `tcp-keepalive` to prune abandoned TCP connections automatically.
* Terminate runaway or misbehaving client sockets using `CLIENT KILL`.
