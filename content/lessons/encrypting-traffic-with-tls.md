---
slug: encrypting-traffic-with-tls
title: Encrypting Traffic with TLS
topic: security-and-operations
kind: technique
summary: Secure in-flight data across public and internal networks by configuring native TLS/SSL encryption and certificates.
tags:
  - tls
  - ssl
  - encryption
  - certificates
related:
  - network-binding-and-protected-mode
  - authentication-with-requirepass
---
> **In one line:** Native TLS encryption secures Redis network communication against eavesdropping, interception, and man-in-the-middle attacks.

## The idea
By default, Redis transmits data across TCP sockets in plaintext using the human-readable RESP protocol. Anyone with packet sniffing capabilities on the underlying network can intercept passwords, user session tokens, and cached sensitive data.

Starting with **Redis 6**, native **TLS/SSL support** encrypts all traffic between clients and Redis, as well as replication links between primary and replica nodes.

```text
[Client Application] ===== Encrypted TLS Tunnel (Port 6379) =====> [Redis Server]
                                                                        |
                                                     Encrypted Replication Link (TLS)
                                                                        v
                                                                 [Replica Server]
```

## See it
Configure native TLS parameters in `redis.conf`:

```text
# Disable plaintext TCP port (or keep open for local migration)
port 0
tls-port 6379

# Certificate Authority and server certificate paths
tls-cert-file /etc/redis/tls/redis.crt
tls-key-file /etc/redis/tls/redis.key
tls-ca-cert-file /etc/redis/tls/ca.crt

# Require mutual TLS (mTLS) client verification
tls-auth-clients yes

# Enable TLS encryption for master-replica replication streams
tls-replication yes
```

Connect securely with `redis-cli` using TLS certificates:

```bash
# Connect with mutual TLS client certificates
$ redis-cli --tls   --cacert /etc/redis/tls/ca.crt   --cert /etc/redis/tls/client.crt   --key /etc/redis/tls/client.key   -h redis.internal.corp -p 6379

redis.internal.corp:6379> PING
PONG

# Verify cipher and session parameters
redis.internal.corp:6379> INFO stats
```

## Go deeper
TLS encryption introduces slight CPU and latency overhead due to cryptographic handshake and encryption computations. In performance-critical microservice architectures, TLS sessions can reuse session caching (`tls-session-cache yes`) to avoid full cryptographic renegotiations on repeated client connections.

Mutual TLS (mTLS) provides dual benefits: encryption in transit and identity verification. By setting `tls-auth-clients yes`, the Redis server validates that incoming client applications present an x509 certificate signed by your corporate internal Certificate Authority. This prevents unauthorized servers in the VPC from connecting even if they have network access.

| TLS Setting | Default | Recommended Production Value |
| :--- | :--- | :--- |
| `tls-port` | 0 (disabled) | 6379 |
| `tls-auth-clients` | yes | yes (mutual authentication) |
| `tls-replication` | no | yes |

> **Tip:** If compiling Redis from source, ensure you compile with TLS support enabled: `make BUILD_TLS=yes`.

## Watch out
* Ensure TLS certificates do not expire silently; monitor certificate expiration dates in your infrastructure alerting.
* Connecting with a non-TLS client to a `tls-port` results in immediate socket connection termination.

## Remember
* Native TLS encrypts both client communication and replication synchronization streams.
* Configure `tls-port`, server certificates, private keys, and CA certificates in `redis.conf`.
* Mutual TLS (`tls-auth-clients yes`) verifies client identity before establishing the application connection.
