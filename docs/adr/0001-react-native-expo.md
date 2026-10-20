# ADR 0001: React Native With Expo Development Builds

## Status

Proposed

## Context

OTR Mobile needs a native mobile product with fast iteration, iOS-first validation, Android compatibility, and room for custom Swift/Kotlin modules.

## Decision

Use React Native, Expo, TypeScript, Expo Router, Development Builds, and prebuild support.

## Alternatives

- Pure native iOS first: stronger iOS integration but delays Android and shared logic.
- Bare React Native from day one: more native control but higher setup cost.
- Expo Go-only: fast demos but too limiting for background work, native modules, and media APIs.

## Consequences

The project gets a productive mobile foundation while preserving native escape hatches. Agents must avoid Expo Go-only assumptions.
