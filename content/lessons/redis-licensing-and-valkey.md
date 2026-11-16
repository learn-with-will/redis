---
slug: redis-licensing-and-valkey
title: Redis Licensing History and the Valkey Fork
topic: fundamentals
kind: concept
summary: The factual timeline of Redis licensing from BSD to source-available and AGPLv3, and the creation of the Valkey fork.
tags:
  - licensing
  - valkey
  - open-source
  - ecosystem
related:
  - what-is-redis
  - installing-and-running-redis
  - redis-vs-memcached-and-rdbms
---
> **In one line:** Redis transitioned from BSD to dual source-available licenses in 2024, added AGPLv3 in 2025 with Redis 8, and inspired the Linux Foundation's Valkey fork.

## The idea

Understanding the licensing history of Redis is crucial for legal compliance, infrastructure planning, and open-source contributions. Redis was originally created by Salvatore Sanfilippo (antirez) in 2009 under the permissive, OSI-approved BSD-3-Clause license.

In March 2024, Redis Ltd. changed the licensing model for subsequent versions, prompting major industry shifts and the creation of an independent fork governed by the Linux Foundation.

| Period / Version | Applicable Licenses | OSI Open Source? | Notes |
|---|---|---|---|
| **2009 – March 2024 (<= 7.2.4)** | BSD-3-Clause | **Yes** | Permissive open source license |
| **March 2024 – May 2025** | Dual RSALv2 / SSPLv1 | **No** | Source-available; restricts cloud providers |
| **May 2025+ (Redis 8.0+)** | Tri-license: AGPLv3, RSALv2, SSPLv1 | **Yes** (under AGPLv3) | AGPLv3 restored OSI open-source status |
| **Valkey (2024+)** | BSD-3-Clause | **Yes** | Independent fork governed by Linux Foundation |

> **Note:** Source-available licenses such as RSALv2 and SSPLv1 are **not** OSI-approved open source because they place commercial usage restrictions on hosting companies offering the software as a managed cloud service.

## See it

In March 2024, after Redis Ltd. announced the transition away from BSD, the Linux Foundation, alongside major technology contributors including AWS, Google Cloud, Oracle, and Ericsson, established **Valkey**:

```bash
# Checking Redis version from the CLI
redis-server --version
# Output indicates current Redis distribution and active license terms

# Starting a Valkey instance (drop-in protocol and command compatible)
valkey-server --port 6379

# Connect with the standard CLI
valkey-cli PING
# Returns PONG

# Both engines share the same command signatures
valkey-cli SET framework "Valkey"
valkey-cli GET framework
```

Valkey was forked directly from Redis 7.2.4 (the last BSD-licensed release) and maintains drop-in compatibility with core Redis APIs, commands, and the RESP wire protocol.

## Go deeper

In May 2025, with the launch of **Redis 8.0**, Redis Ltd. reintroduced an OSI-approved open-source option by adopting the GNU Affero General Public License v3 (**AGPLv3**). Today, developers utilizing Redis 8 can choose between AGPLv3, RSALv2, or SSPLv1 depending on their commercial and distribution requirements.

Because Valkey and Redis share the same historical codebase and command specifications, operational patterns, client drivers, and data modeling strategies learned for one apply directly to the other.

## Watch out

- Never describe Redis between March 2024 and May 2025 as open source; that window was strictly source-available.
- Do not assume AGPLv3 permits proprietary distribution without reciprocal source code disclosure for network services.

## Remember

- Redis was originally BSD-licensed until March 2024, when it moved to RSALv2/SSPLv1.
- Redis 8 added the OSI-approved AGPLv3 license option in May 2025.
- Valkey is a BSD-licensed fork hosted under the Linux Foundation maintaining drop-in protocol compatibility.
