---
slug: cluster-redirects-moved-and-ask
title: "Cluster Redirects: MOVED and ASK"
topic: scaling-and-clustering
kind: concept
summary: Understand how smart clients navigate cluster routing, MOVED permanent redirects, and ASK resharding redirects.
tags:
  - cluster
  - moved
  - ask
  - resharding
related:
  - redis-cluster-sharding-hash-slots
  - hash-tags-multi-key-operations
---
> **In one line:** MOVED signals a permanent slot ownership change, while ASK directs a one-off query during active slot resharding.

## The idea
Redis Cluster does not use a central proxy or router. Clients connect directly to any node in the cluster. When a client issues a command for a key that does not belong to the node it connected to, the node redirects the client using protocol errors: `MOVED` or `ASK`.

Smart Redis client libraries cache the slot-to-node mapping in memory. When a redirect arrives, the client updates its internal routing table and transparently retries the query on the correct node.

| Redirect Error | Meaning | Client Action |
| :--- | :--- | :--- |
| **-MOVED slot ip:port** | Permanent slot ownership | Update slot routing table; retry query at new node |
| **-ASK slot ip:port** | Temporary redirect during slot migration | Send `ASKING` flag, then execute query at new node; DO NOT update routing table |

## See it
Interact with a cluster node using standard mode versus cluster mode (`-c`) in `redis-cli`:

```bash
# Standard mode: displays raw MOVED redirect error
$ redis-cli -p 7000
127.0.0.1:7000> GET user:1000
(error) MOVED 12454 127.0.0.1:7002

# Cluster mode (-c): automatically follows redirects
$ redis-cli -c -p 7000
127.0.0.1:7000> GET user:1000
-> Redirected to slot [12454] located at 127.0.0.1:7002
"Alice"
127.0.0.1:7002> SET user:1000 "Bob"
OK
```

## Go deeper
During online resharding (moving slot 12454 from Node A to Node B), some keys have migrated while others remain on Node A. 
1. The client queries Node A.
2. If Node A still holds the key, it answers directly.
3. If the key was already migrated to Node B, Node A replies `-ASK 12454 127.0.0.1:7002`.
4. The client sends `ASKING` to Node B, then issues `GET user:1000`.

Because `ASK` is ephemeral, the client retains Node A in its internal slot table for subsequent queries until migration completes and Node A starts answering with `MOVED`.

> **Note:** The `ASKING` command tells Node B to process this single query even though Node B does not yet officially own slot 12454.

## Watch out
* Raw clients without cluster mode (`redis-cli` without `-c`) do not follow redirects and receive error strings instead.
* A sudden burst of `MOVED` redirects indicates a topology change, failover, or resharding completion across the cluster.

## Remember
* Redis Cluster uses direct client routing with `MOVED` and `ASK` redirects instead of proxy overhead.
* `MOVED` indicates permanent slot assignment and causes smart clients to refresh their routing cache.
* `ASK` is a temporary redirection during live resharding that requires an initial `ASKING` command on the target.
