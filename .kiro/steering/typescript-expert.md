---
inclusion: always
fileMatchPattern: '**/*.{ts,tsx}'
---

# TypeScript Expert Guidelines

Advanced TypeScript patterns and best practices for type-safe development.

## Type System Patterns

### Branded Types for Domain Modeling
```typescript
type Brand<K, T> = K & { __brand: T };
type UserId = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;

// Prevents accidental mixing of domain primitives
function processOrder(orderId: OrderId, userId: UserId) { }
```
Use for: Critical domain primitives, API boundaries, currency/units

### Advanced Conditional Types
```typescript
// Recursive type manipulation
type DeepReadonly<T> = T extends (...args: any[]) => any 
  ? T 
  : T extends object 
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

// Template literal type magic
type PropEventSource<Type> = {
  on<Key extends string & keyof Type>
    (eventName: `${Key}Changed`, callback: (newValue: Type[Key]) => void): void;
};
```
Watch for: Type instantiation depth errors (limit recursion to 10 levels)

### Type Inference Techniques
```typescript
// Use 'satisfies' for constraint validation (TS 5.0+)
const config = {
  api: "https://api.example.com",
  timeout: 5000
} satisfies Record<string, string | number>;

// Const assertions for maximum inference
const routes = ['/home', '/about', '/contact'] as const;
type Route = typeof routes[number];
```

## Performance Optimization

### Type Checking Performance
- Enable `skipLibCheck: true` for library type checking
- Use `incremental: true` with `.tsbuildinfo` cache
- Configure `include`/`exclude` precisely
- For monorepos: Use project references with `composite: true`

### Common Performance Issues

**"Type instantiation is excessively deep"**
- Replace type intersections with interfaces
- Split large union types (>100 members)
- Avoid circular generic constraints
- Use type aliases to break recursion

**"Excessive stack depth comparing types"**
```typescript
// Bad: Infinite recursion
type InfiniteArray<T> = T | InfiniteArray<T>[];

// Good: Limited recursion
type NestedArray<T, D extends number = 5> = 
  D extends 0 ? T : T | NestedArray<T, [-1, 0, 1, 2, 3, 4][D]>[];
```

## Error Handling Patterns

### Custom Error Classes
```typescript
class DomainError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'DomainError';
    Error.captureStackTrace(this, this.constructor);
  }
}
```

### Result Types
Use discriminated unions for type-safe error handling:
```typescript
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };
```

## Strict Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

## ESM-First Approach
- Set `"type": "module"` in package.json
- Use `.mts` for TypeScript ESM files if needed
- Configure `"moduleResolution": "bundler"` for modern tools
- Use dynamic imports for CJS: `const pkg = await import('cjs-package')`

## Code Review Checklist

### Type Safety
- [ ] No implicit `any` types (use `unknown` or proper types)
- [ ] Strict null checks enabled and properly handled
- [ ] Type assertions (`as`) justified and minimal
- [ ] Generic constraints properly defined
- [ ] Discriminated unions for error handling
- [ ] Return types explicitly declared for public APIs

### TypeScript Best Practices
- [ ] Prefer `interface` over `type` for object shapes (better error messages)
- [ ] Use const assertions for literal types
- [ ] Leverage type guards and predicates
- [ ] Avoid type gymnastics when simpler solution exists
- [ ] Template literal types used appropriately
- [ ] Branded types for domain primitives

### Performance Considerations
- [ ] Type complexity doesn't cause slow compilation
- [ ] No excessive type instantiation depth
- [ ] Avoid complex mapped types in hot paths
- [ ] Use `skipLibCheck: true` in tsconfig
- [ ] Project references configured for monorepos

### Module System
- [ ] Consistent import/export patterns
- [ ] No circular dependencies
- [ ] Proper use of barrel exports (avoid over-bundling)
- [ ] ESM/CJS compatibility handled correctly
- [ ] Dynamic imports for code splitting

## Common Fixes

### "The inferred type of X cannot be named"
1. Export the required type explicitly
2. Use `ReturnType<typeof function>` helper
3. Break circular dependencies with type-only imports

### Missing Type Declarations
```typescript
// types/ambient.d.ts
declare module 'some-untyped-package' {
  const value: unknown;
  export default value;
}
```

### Module Resolution Issues
1. Check `moduleResolution` matches your bundler
2. Verify `baseUrl` and `paths` alignment
3. For monorepos: Ensure workspace protocol (workspace:*)
4. Try clearing cache: `rm -rf node_modules/.cache .tsbuildinfo`

## Type Testing
```typescript
import { expectTypeOf } from 'vitest'

test('Avatar props are correctly typed', () => {
  expectTypeOf<Avatar>().toHaveProperty('size')
  expectTypeOf<Avatar['size']>().toEqualTypeOf<'sm' | 'md' | 'lg'>()
})
```

Use type testing for:
- Publishing libraries
- Complex generic functions
- Type-level utilities
- API contracts
