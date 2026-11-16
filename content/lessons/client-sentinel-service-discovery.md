---
slug: client-sentinel-service-discovery
title: Client-Side Sentinel Service Discovery
topic: scaling-and-clustering
kind: technique
summary: Configure client drivers to connect via Sentinel connection pools and handle dynamic failover events gracefully.
tags:
  - sentinel
  - drivers
  - discovery
related:
  - sentinel-architecture-and-quorum
  - automatic-failover-workflow
---
> **In one line:** Sentinel-aware client libraries discover the current primary by querying Sentinel pools rather than hardcoding Redis IPs.

## The idea
In a high-availability Redis setup with Sentinel, hardcoding the IP address of the primary node in your application configuration will cause outages during failover events.

Instead, applications connect to the Sentinel pool. The client library queries the Sentinels to obtain the current primary's address, connects to that primary, and subscribes to Sentinel's `+switch-master` Pub/Sub channel to automatically reconnect if a failover occurs.

```text
Application Client
   |
   |-- 1. Query: "Who is primary for 'mymaster'?" --> Sentinel Pool (Port 26379)
   |<-- 2. Response: "10.0.0.2:6379" -----------------
   |
   |-- 3. Execute CRUD operations ------------------> Redis Primary (10.0.0.2:6379)
   |
   +-- 4. Listen on '+switch-master' channel -------> Sentinel Pool
```

## See it
Interact directly with a Sentinel instance using `redis-cli` to inspect primary discovery:

```bash
# Connect to Sentinel on port 26379
$ redis-cli -p 26379

# Query primary host and port by cluster name
127.0.0.1:26379> SENTINEL get-master-addr-by-name mymaster
1) "10.0.0.2"
2) "6379"

# Query all connected replicas for read scaling
127.0.0.1:26379> SENTINEL replicas mymaster
1)  1) "name"
    2) "10.0.0.3:6380"
    3) "ip"
    4) "10.0.0.3"
    5) "port"
    6) "6380"
    7) "flags"
    8) "slave"

# Query other known Sentinels
127.0.0.1:26379> SENTINEL sentinels mymaster
```

## Go deeper
When a failover occurs, the Sentinel cluster broadcasts a message on the `+switch-master` Pub/Sub channel with the format `<master-name> <old-ip> <old-port> <new-ip> <new-port>`.

Client libraries that support Sentinel maintain an internal event loop. Upon receiving this message, the library automatically closes invalid socket connections to the old primary, flushes pending command buffers, and establishes new socket connections to the newly promoted primary without throwing application-level exceptions or requiring app restarts.

> **Tip:** Modern Redis drivers (such as `ioredis`, `redis-py`, and `Lettuce`) handle this handshake and subscription automatically. Supply a list of Sentinel seed addresses in your connection string.

## Watch out
* During the brief failover window (typically 3 to 10 seconds), writes to the old primary fail while the new primary is promoted. Clients must implement exponential retry logic.
* Ensure your Docker or Kubernetes setup configures `sentinel announce-ip` so Sentinels broadcast externally routable IP addresses.

## Remember
* Never hardcode primary Redis IPs; pass a list of Sentinel host and port tuples to client drivers.
* Sentinel-aware clients resolve the active primary via `SENTINEL get-master-addr-by-name`.
* Clients subscribe to `+switch-master` to seamlessly reconnect when automated failovers occur.
