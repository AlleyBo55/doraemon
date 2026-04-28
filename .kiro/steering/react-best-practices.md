---
inclusion: always
fileMatchPattern: '**/*.{tsx,ts,jsx,js}'
---

# React and Next.js Best Practices

Comprehensive performance optimization guide for React and Next.js applications from Vercel Engineering. Apply these guidelines when writing, reviewing, or refactoring React/Next.js code.

## Priority Categories

1. **Eliminating Waterfalls** (CRITICAL) - Async operations, Promise.all, Suspense
2. **Bundle Size Optimization** (CRITICAL) - Imports, dynamic loading, code splitting
3. **Server-Side Performance** (HIGH) - RSC, caching, serialization
4. **Client-Side Data Fetching** (MEDIUM-HIGH) - SWR, event listeners
5. **Re-render Optimization** (MEDIUM) - Memo, dependencies, state management
6. **Rendering Performance** (MEDIUM) - SVG, CSS, hydration
7. **JavaScript Performance** (LOW-MEDIUM) - Loops, caching, data structures
8. **Advanced Patterns** (LOW) - Refs, custom hooks

## Critical Rules

### Eliminating Waterfalls

- **Defer await until needed**: Move `await` into branches where actually used
- **Use Promise.all()**: Execute independent operations concurrently
- **Dependency-based parallelization**: Use `better-all` for partial dependencies
- **Start promises early in API routes**: Don't await immediately
- **Strategic Suspense boundaries**: Show wrapper UI while data loads

### Bundle Size Optimization

- **Avoid barrel file imports**: Import directly from source files
  ```tsx
  // ❌ Bad - loads entire library
  import { Check, X } from 'lucide-react'
  
  // ✅ Good - loads only what you need
  import Check from 'lucide-react/dist/esm/icons/check'
  import X from 'lucide-react/dist/esm/icons/x'
  ```

- **Dynamic imports for heavy components**: Use `next/dynamic` for large components
  ```tsx
  const MonacoEditor = dynamic(
    () => import('./monaco-editor').then(m => m.MonacoEditor),
    { ssr: false }
  )
  ```

- **Defer non-critical third-party libraries**: Load analytics/logging after hydration
- **Conditional module loading**: Load large data only when feature is activated
- **Preload on user intent**: Preload on hover/focus for perceived speed

### Server-Side Performance

- **Authenticate Server Actions**: Always verify auth inside each Server Action
  ```tsx
  'use server'
  export async function deleteUser(userId: string) {
    const session = await verifySession()
    if (!session) throw unauthorized('Must be logged in')
    // ... rest of logic
  }
  ```

- **Use React.cache()**: Deduplicate database queries within a request
- **LRU cache for cross-request**: Cache data shared across sequential requests
- **Minimize RSC serialization**: Only pass fields client actually uses
- **Parallel data fetching**: Restructure components to parallelize fetches
- **Use after() for non-blocking**: Schedule logging/analytics after response

### Client-Side Data Fetching

- **Use SWR for deduplication**: Automatic request deduplication
- **Deduplicate event listeners**: Don't attach same listener multiple times
- **Use passive event listeners**: For scroll/touch performance
- **Version localStorage data**: Minimize and version stored data

### Re-render Optimization

- **Defer state reads**: Don't subscribe to state only used in callbacks
- **Extract to memoized components**: Use React.memo for expensive work
- **Narrow effect dependencies**: Use primitive dependencies in effects
- **Subscribe to derived state**: Subscribe to booleans, not raw values
- **Functional setState**: Use functional updates for stable callbacks
- **Lazy state initialization**: Pass function to useState for expensive values
- **Use transitions**: startTransition for non-urgent updates

### Rendering Performance

- **Animate SVG wrapper**: Animate div wrapper, not SVG element
- **Use content-visibility**: For long lists
- **Hoist static JSX**: Extract static JSX outside components
- **Reduce SVG precision**: Optimize SVG coordinate precision
- **Prevent hydration flicker**: Use inline script for client-only data
- **Use explicit conditionals**: Use ternary, not && for conditionals

### JavaScript Performance

- **Batch DOM CSS changes**: Group via classes or cssText
- **Build index maps**: Use Map for repeated lookups
- **Cache property access**: Cache object properties in loops
- **Cache function results**: Module-level Map for memoization
- **Combine iterations**: Combine filter/map into one loop
- **Early exit**: Return early from functions
- **Use Set/Map**: For O(1) lookups instead of arrays

## Common Patterns

### Parallel Fetching
```tsx
// ❌ Sequential
const user = await fetchUser()
const posts = await fetchPosts()

// ✅ Parallel
const [user, posts] = await Promise.all([
  fetchUser(),
  fetchPosts()
])
```

### Suspense Boundaries
```tsx
function Page() {
  return (
    <div>
      <Header />
      <Suspense fallback={<Skeleton />}>
        <DataDisplay />
      </Suspense>
      <Footer />
    </div>
  )
}
```

### Component Composition for Parallel Fetches
```tsx
// ✅ Both fetch simultaneously
async function Header() {
  const data = await fetchHeader()
  return <div>{data}</div>
}

async function Sidebar() {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}

export default function Page() {
  return (
    <div>
      <Header />
      <Sidebar />
    </div>
  )
}
```

## References

- [Vercel React Best Practices](https://github.com/vercel/react-best-practices)
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
