# ADR-0003: ICE recovery

## Status

Accepted

## Context

Mobile network changes and temporary connectivity loss can interrupt a WebRTC connection. Immediately tearing down a call can make recovery harder, but retrying indefinitely wastes resources.

## Decision

Use a bounded recovery process for eligible connection failures. Keep call and audio resources available during recovery where practical, and stop retrying when the configured timeout or retry limit is reached.

## Consequences

Transient interruptions may recover without a new call. Recovery is not guaranteed and may take time. Retry limits and timings are implementation configuration and should be checked in src/constants/config.ts and related tests.
