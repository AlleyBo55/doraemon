---
inclusion: always
---

# Next.js App Router Best Practices

Principles for Next.js App Router development.

## Server vs Client Components

### Decision Tree
- **Need useState, useEffect, event handlers?** → Client Component (`'use client'`)
- **Direct data fetching, no interactivity?** → Server Component (default)
- **Both?** → Split: Server parent + Client child

### By Default
- **Server**: Data fetching, layout, static content
- **Client**: Forms, buttons, interactive UI

## Data Fetching Patterns

### Fetch Strategy
- **Default**: Static (cached at build)
- **Revalidate**: ISR (time-based refresh)
- **No-store**: Dynamic (every request)

### Data Flow
- **Database**: Server Component fetch
- **API**: fetch with caching
- **User input**: Client state + server action

## Routing Principles

### File Conventions
- `page.tsx` - Route UI
- `layout.tsx` - Shared layout
- `loading.tsx` - Loading state
- `error.tsx` - Error boundary
- `not-found.tsx` - 404 page

### Route Organization
- **Route groups** `(name)` - Organize without URL
- **Parallel routes** `@slot` - Multiple same-level pages
- **Intercepting** `(.)` - Modal overlays

## API Routes

### Route Handlers
- **GET** - Read data
- **POST** - Create data
- **PUT/PATCH** - Update data
- **DELETE** - Remove data

### Best Practices
- Validate input with Zod
- Return proper status codes
- Handle errors gracefully
- Use Edge runtime when possible

## Performance Principles

### Image Optimization
- Use next/image component
- Set priority for above-fold
- Provide blur placeholder
- Use responsive sizes

### Bundle Optimization
- Dynamic imports for heavy components
- Route-based code splitting (automatic)
- Analyze with bundle analyzer

## Metadata

### Static vs Dynamic
- **Static export**: Fixed metadata
- **generateMetadata**: Dynamic per-route

### Essential Tags
- title (50-60 chars)
- description (150-160 chars)
- Open Graph images
- Canonical URL

## Caching Strategy

### Cache Layers
- **Request**: fetch options
- **Data**: revalidate/tags
- **Full route**: route config

### Revalidation
- **Time-based**: `revalidate: 60`
- **On-demand**: `revalidatePath/Tag`
- **No cache**: `no-store`

## Server Actions

### Use Cases
- Form submissions
- Data mutations
- Revalidation triggers

### Best Practices
- Mark with `'use server'`
- Validate all inputs
- Return typed responses
- Handle errors

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| 'use client' everywhere | Server by default |
| Fetch in client components | Fetch in server |
| Skip loading states | Use loading.tsx |
| Ignore error boundaries | Use error.tsx |
| Large client bundles | Dynamic imports |

## Project Structure

```
app/
├── (marketing)/     # Route group
│   └── page.tsx
├── (dashboard)/
│   ├── layout.tsx   # Dashboard layout
│   └── page.tsx
├── api/
│   └── [resource]/
│       └── route.ts
└── components/
    └── ui/
```

**Remember:** Server Components are the default for a reason. Start there, add client only when needed.
