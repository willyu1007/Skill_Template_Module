# example.api — Ability

This document describes what this module is responsible for, and what it is NOT responsible for.

## Responsibilities

- **User CRUD operations**: Create, read, update, delete user records
- **User validation**: Validate user input data before persistence
- **User serialization**: Transform user data for API responses
- **Health reporting**: Expose service health status

## Non-responsibilities

- **Authentication/Authorization**: Handled by a separate auth module
- **User notifications**: Handled by a notification service
- **Audit logging**: Handled by infrastructure/middleware
- **Rate limiting**: Handled by API gateway/infrastructure

## External dependencies

| Dependency | Type | Purpose |
|------------|------|---------|
| Database | Infrastructure | User data persistence |
| Cache | Infrastructure | Optional: user data caching |

## Invariants

1. User IDs must be globally unique
2. Email addresses must be unique within the system
3. User creation must validate required fields before persistence
4. All user data responses must exclude sensitive fields (e.g., password hashes)

## Failure modes

| Scenario | Behavior |
|----------|----------|
| Database unavailable | Return 503 Service Unavailable |
| Invalid user input | Return 400 Bad Request with validation errors |
| User not found | Return 404 Not Found |
| Duplicate email | Return 409 Conflict |

