---
slug: network-binding-and-protected-mode
title: Network Binding and Protected Mode
topic: security-and-operations
kind: technique
summary: Lock down network interfaces, bind loopback or private VPC subnets, and understand Redis protected mode security.
tags:
  - security
  - protected-mode
  - bind
  - networking
related:
  - installing-and-running-redis
  - connecting-with-redis-cli
---
> **In one line:** Secure Redis instances by binding only to internal private interfaces and maintaining protected mode safeguards.

## The idea
Redis was historically designed for trusted internal networks without exposure to the public internet. Running an open Redis server on a public IP without authentication is an immediate security vulnerability, often leading to ransomware infection within minutes.

To safeguard out-of-the-box installations, Redis features **Protected Mode**. If Redis starts with default settings—no password configured and bound to all interfaces—it automatically enters protected mode and refuses all incoming queries from non-loopback IP addresses.

| Network Directive | Behavior | Production Safety |
| :--- | :--- | :--- |
| `bind 127.0.0.1` | Listens only on local loopback interface | Safe for local-only apps |
| `bind 10.0.1.5` | Listens only on private VPC internal IP | Recommended for microservices |
| `bind 0.0.0.0` | Listens on all interfaces (including public) | Highly dangerous unless firewalled |

## See it
Configure secure interface binding in `redis.conf`:

```text
# Bind specifically to loopback and private internal network adapter
bind 127.0.0.1 10.0.4.15

# Enable protected mode explicitly
protected-mode yes

# Change default port if desired
port 6379

# Close socket after idle timeout
timeout 300
```

Observe protected mode rejecting unauthenticated external connections:

```bash
# External client attempting connection when protected mode is triggered
$ redis-cli -h 198.51.100.2
198.51.100.2:6379> PING
Error: DENIED Redis is running in protected mode because protected mode is enabled, 
no bind address was specified, and no password is configured to authenticate clients.
```

## Go deeper
Protected mode acts as a safety harness for developers who forget to configure security. As soon as you configure a password (`requirepass`) or bind to a specific non-wildcard IP address, Redis exits protected mode and permits configured remote traffic.

In cloud environments (such as AWS, GCP, or Azure), ensure security groups or firewalls restrict port 6379 strictly to application subnets, completely denying public ingress. Defense-in-depth principles require configuring network security groups, private VPC endpoints, firewall rules, and local Redis binding simultaneously so that a failure in one security layer cannot expose your caching cluster.

> **Tip:** Never disable protected mode (`protected-mode no`) unless you have already configured robust firewall rules and strong authentication passwords.

## Watch out
* Binding to `0.0.0.0` on a cloud VM with an attached public IP exposes the Redis instance to internet-wide scanning bots.
* Docker container port bindings like `-p 6379:6379` bind to `0.0.0.0` by default; use `-p 127.0.0.1:6379:6379` instead.

## Remember
* Protected mode prevents remote connections when no password and no specific bind address are configured.
* Bind Redis instances explicitly to private internal VPC IP addresses, never `0.0.0.0`.
* Enforce network-layer isolation with cloud security groups and private VPC subnets.
