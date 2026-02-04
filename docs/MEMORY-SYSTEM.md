# Secure Memory System

Self-learning memory with high-security standards.

## Security Layers

### 1. Encryption at Rest (AES-256-GCM)
- All memories encrypted before storage
- Machine-derived keys (no hardcoded secrets)
- Authenticated encryption prevents tampering

### 2. Content Classification
- Auto-detects sensitive data (credentials, PII, paths)
- Four levels: `public`, `internal`, `confidential`, `restricted`
- Restricted content is blocked, confidential is encrypted

### 3. Sanitization Pipeline
- Removes API keys, tokens, passwords
- Redacts file paths, IPs, emails
- High-entropy string detection (potential secrets)

### 4. Tamper-Evident Audit Log
- Hash-chain linking (like blockchain)
- Every operation logged with timestamp
- Integrity verification on startup

### 5. Signature Verification
- HMAC signatures on all entries
- Detects unauthorized modifications
- Rejects corrupted data

## Storage Location

```
~/.doraemon/
├── memory/
│   ├── index.json          # Entry index
│   ├── entries/            # Encrypted memory files
│   │   └── mem_*.enc
│   └── backups/            # Periodic backups
└── audit/
    └── memory-audit.jsonl  # Audit trail
```

## Usage

### Enable in .env
```bash
MEMORY_SYSTEM_ENABLED=1
```

### From Renderer (via IPC)
```typescript
// Learn something
await window.electronAPI.memoryLearn({
  content: 'User prefers dark mode',
  category: 'preference',
  source: 'explicit_teaching',
});

// Recall memories
const memories = await window.electronAPI.memoryRecall('dark mode');

// Learn a preference
await window.electronAPI.memoryLearnPreference('theme', 'dark');

// Learn a correction
await window.electronAPI.memoryLearnCorrection('colour', 'color');

// Get stats
const stats = await window.electronAPI.memoryStats();
```

### Memory Categories
- `learning` - Things learned from interactions
- `preference` - User preferences
- `context` - Contextual information
- `interaction` - Conversation summaries
- `skill` - Learned skills/capabilities
- `correction` - Error corrections
- `pattern` - Observed patterns

## Auto-Learning

The system automatically learns from conversations:
1. Filters out trivial messages (greetings, short responses)
2. Extracts key insights from meaningful exchanges
3. Sanitizes before storage
4. Encrypts and signs

## Security Guarantees

- **Confidentiality**: AES-256-GCM encryption
- **Integrity**: HMAC signatures + hash-chain audit
- **Availability**: Automatic backups, graceful degradation
- **Non-repudiation**: Immutable audit trail

## Audit Verification

```typescript
// Verify audit chain integrity
const result = await verifyIntegrity();
if (!result.valid) {
  console.error('Audit chain tampered at entry:', result.brokenAt);
}
```
