---
inclusion: manual
---

# API Patterns

API design principles and decision-making for modern applications.

## API Style Selection

### REST
**Use when:**
- Standard CRUD operations
- Public API for third parties
- Simple resource-based operations
- Need HTTP caching

**Characteristics:**
- Resource-oriented URLs
- HTTP methods (GET, POST, PUT, DELETE)
- Stateless
- Well-understood conventions

### GraphQL
**Use when:**
- Complex data relationships
- Need flexible queries
- Mobile apps (reduce over-fetching)
- Multiple clients with different needs

**Characteristics:**
- Single endpoint
- Client specifies exact data needed
- Strong typing
- Real-time subscriptions

### tRPC
**Use when:**
- TypeScript monorepo
- Full-stack TypeScript project
- Internal APIs only
- Want end-to-end type safety

**Characteristics:**
- No code generation
- Automatic type inference
- RPC-style calls
- TypeScript required

## REST Best Practices

### Resource Naming
- Use nouns, not verbs: `/users` not `/getUsers`
- Plural for collections: `/users`
- Singular for specific resource: `/users/123`
- Nested resources: `/users/123/posts`

### HTTP Methods
- **GET** - Retrieve resource(s)
- **POST** - Create new resource
- **PUT** - Replace entire resource
- **PATCH** - Update partial resource
- **DELETE** - Remove resource

### Status Codes
- **200** - OK (successful GET, PUT, PATCH)
- **201** - Created (successful POST)
- **204** - No Content (successful DELETE)
- **400** - Bad Request (validation error)
- **401** - Unauthorized (not authenticated)
- **403** - Forbidden (not authorized)
- **404** - Not Found
- **500** - Internal Server Error

## Response Format

### Consistent Structure
```typescript
// Success
{
  "data": { /* resource */ },
  "meta": { "timestamp": "2024-01-01T00:00:00Z" }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

### Pagination
```typescript
{
  "data": [ /* items */ ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## Versioning

### URI Versioning (Recommended)
```
/api/v1/users
/api/v2/users
```
**Pros:** Clear, easy to route, cache-friendly

### Header Versioning
```
Accept: application/vnd.api+json; version=1
```
**Pros:** Clean URLs, RESTful

### Query Parameter
```
/api/users?version=1
```
**Pros:** Simple, backward compatible

## Authentication

### JWT (JSON Web Tokens)
**Use when:**
- Stateless authentication
- Microservices
- Mobile apps

```typescript
Authorization: Bearer <token>
```

### API Keys
**Use when:**
- Server-to-server
- Simple authentication
- Rate limiting per client

```typescript
X-API-Key: <key>
```

### OAuth 2.0
**Use when:**
- Third-party access
- Social login
- Delegated authorization

## Rate Limiting

### Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

### Response
```typescript
// 429 Too Many Requests
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "retryAfter": 60
  }
}
```

## Security Best Practices

- Always validate input
- Use HTTPS only
- Implement rate limiting
- Sanitize error messages (don't expose internals)
- Use proper authentication
- Implement CORS correctly
- Log security events

## Documentation

### OpenAPI/Swagger
```yaml
openapi: 3.0.0
info:
  title: My API
  version: 1.0.0
paths:
  /users:
    get:
      summary: List users
      responses:
        '200':
          description: Success
```

### Essential Documentation
- Authentication method
- Rate limits
- Error codes
- Example requests/responses
- Pagination details
- Versioning strategy

## Decision Checklist

Before designing an API:
- [ ] Chosen API style for this context?
- [ ] Defined consistent response format?
- [ ] Planned versioning strategy?
- [ ] Considered authentication needs?
- [ ] Planned rate limiting?
- [ ] Documentation approach defined?

## Anti-Patterns

**DON'T:**
- Use verbs in REST endpoints (`/getUsers`)
- Return inconsistent response formats
- Expose internal errors to clients
- Skip rate limiting
- Ignore authentication on mutations
- Use GET for mutations
- Return 200 for errors

**DO:**
- Choose API style based on context
- Document thoroughly
- Use appropriate status codes
- Validate all inputs
- Handle errors gracefully
