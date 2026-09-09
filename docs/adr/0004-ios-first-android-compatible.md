# ADR 0004: iOS-First Validation With Android-Compatible Architecture

## Status

Proposed

## Context

The first production-quality client experience should be validated on iOS, but the product should not become iOS-only by accident.

## Decision

Develop iOS-first while keeping shared business logic, domain models, repositories, and sync engine Android-compatible. Platform APIs live behind native adapters.

## Alternatives

- iOS-only first: faster native polish but risks a rewrite for Android.
- Equal platform implementation from day one: broader coverage but slower validation.

## Consequences

Native capability is allowed when needed, but platform-specific assumptions must not enter the domain layer.
