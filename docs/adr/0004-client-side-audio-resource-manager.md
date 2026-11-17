# ADR-0004: Audio resource lifecycle

## Status

Accepted

## Context

A call can create Web Audio nodes, audio contexts, and media tracks. These resources must be stopped or released when calls end or devices change.

## Decision

Use a client-side resource manager to track applicable audio resources and provide cleanup during call teardown and audio reconfiguration.

## Consequences

Centralized cleanup reduces the chance of leaving microphones active or resources allocated after a call. Components that allocate resources must follow the lifecycle conventions and tests should cover teardown paths.
