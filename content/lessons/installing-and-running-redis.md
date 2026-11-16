---
slug: installing-and-running-redis
title: Installing and Running Redis with Docker and CLI
topic: fundamentals
kind: tool
summary: Deploy Redis instantly using official Docker images or local packages, configuring default network port 6379.
tags:
  - docker
  - installation
  - cli
  - devops
related:
  - connecting-with-redis-cli
  - what-is-redis
  - logical-databases-select
---
> **In one line:** Spin up a local Redis container or native service on default port 6379 to begin developing in seconds.

## The idea

Running Redis locally provides an isolated playground for experimenting with data structures, scripting, and configuration directives. The most reproducible method across Windows, macOS, and Linux workstations is the official Docker container image.

By default, Redis listens for incoming TCP client connections on port **6379** (a number derived from the telephone keypad spelling of "P-E-Z", the favorite candy of creator antirez). When testing applications, binding this port to localhost allows development clients to communicate transparently with the containerized engine.

| Deployment Mode | Command / Tool | Best For | Considerations |
|---|---|---|---|
| **Docker Container** | `docker run -p 6379:6379 redis:8` | Local development and CI | Ephemeral storage unless volumes are mapped |
| **Linux Package** | `apt install redis-server` | Dedicated virtual machines | Runs as background systemd service |
| **macOS Homebrew** | `brew install redis` | Local macOS workstation | Starts via `brew services start redis` |

> **Tip:** Always bind host ports explicitly when running development containers and avoid running Redis directly on public network interfaces without authentication.

## See it

Start an official Redis 8 container with persistent storage mapped to your local machine:

```bash
# Run Redis in the background with host port 6379 forwarded
docker run -d \
  --name local-redis \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:8

# Verify that the container is healthy and listening
docker ps --filter name=local-redis

# Connect directly to the container using redis-cli
docker exec -it local-redis redis-cli PING

# Test writing and reading inside the container
docker exec -it local-redis redis-cli SET environment "development"
docker exec -it local-redis redis-cli GET environment
docker exec -it local-redis redis-cli DBSIZE
```

The server immediately responds with `PONG` and stores the key, confirming that the network transport and server process are operational.

## Go deeper

When Redis starts up, it reads directives from an optional configuration file (`redis.conf`). Key configuration variables include:
- `bind`: Network interfaces allowed to connect (default: `127.0.0.1` for loopback).
- `port`: The listening TCP port (default: `6379`).
- `protected-mode`: Rejects non-loopback connections if no password authentication is set.
- `dir`: Working directory where RDB snapshots and AOF logs are written.
- `requirepass`: Sets a legacy plaintext authentication password for connected clients.
- `maxmemory`: Restricts maximum physical RAM consumed before eviction policies trigger.

Understanding these parameters ensures your local environment mirrors production deployments accurately.

## Watch out

- Running Docker without `-p 6379:6379` prevents host applications from connecting to the containerized Redis server.
- Default Docker containers run without password authentication; never expose container ports to the open internet.

## Remember

- Docker provides the cleanest development setup via the official `redis:8` image.
- Redis listens on default TCP port 6379.
- Use persistent volumes to preserve cache and database state across container restarts.
