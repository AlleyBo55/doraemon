# 🏥 Health & Hospital Integration

Doraemon can search for real doctors, schedules, and health articles from a hospital network's public API — all triggered naturally from WhatsApp conversations.

## How It Works

When someone tells Doraemon they're sick or asks about doctors/hospitals, the health skill activates and:

1. Maps symptoms to the right medical specialty
2. Calls the hospital's JSON API to find real doctors with live schedules
3. Presents results conversationally in WhatsApp
4. Offers to walk through a mock appointment booking flow

The entire flow is API-driven — Doraemon never tells users to "check the website." It searches, parses, and presents results itself.

## Architecture

```
User: "batuk2 di bekasi"
         │
         ▼
┌─────────────────────┐
│  OpenClaw Gateway    │  ← Receives WhatsApp message
│  (Claude Haiku 4.5)  │
└────────┬────────────┘
         │ Skill activated by symptom keywords
         ▼
┌─────────────────────┐
│  health-skill.md     │  ← Loaded from ~/.openclaw/workspace/skills/health/SKILL.md
│  (with partner ctx)  │
└────────┬────────────┘
         │ exec(curl) tool calls
         ▼
┌─────────────────────┐
│  Hospital JSON API   │  ← Public endpoints, no auth
│  (services.*.com)    │
└────────┬────────────┘
         │ Doctor data + schedules
         ▼
┌─────────────────────┐
│  Formatted response  │  ← Doctor name, clinic, schedule, slots
│  sent via WhatsApp   │
└─────────────────────┘
```

## Key Components

### Skill File (`openclaw/health-skill.md`)

The skill markdown contains:
- Symptom → specialty mapping table
- API endpoint documentation with curl examples
- Response parsing instructions
- Appointment booking flow (mock only)
- Emergency detection keywords
- Partner context placeholder (injected at deploy time)

The source file is brand-agnostic — it uses placeholders like `[PARTNER_API_BASE]` and `[PARTNER_CALL_CENTER]`.

### Partner Config (`openclaw/partners/health.json`)

Contains all hospital-specific data:
- Partner info: name, domain, call center, WhatsApp number
- API endpoints: doctor search, specialities, clinics, articles
- Symptom → specialty keyword mapping
- Clinic reference IDs for city-based filtering

This file is gitignored. Use `health.json.example` as a template.

### Injection System (`openclaw/inject-partner-context.sh`)

At deploy time, this script:
1. Reads the partner JSON config
2. Replaces all `[PARTNER_*]` placeholders in the skill file
3. Injects a `<!-- PARTNER_CONTEXT_START -->` block with clinic directory, API reference, etc.

The source skill file stays clean — only the deployed copy gets partner data.

### Sync Script (`openclaw/sync.sh`)

Deploys skills to the OpenClaw runtime:
1. Copies skill source to a temp backup
2. Runs partner context injection on the source
3. Syncs the injected version to `~/.openclaw/workspace/skills/health/SKILL.md`
4. Restores the original brand-agnostic source from backup

Run from the `doraemon/` directory:
```bash
bash openclaw/sync.sh
```



## Adding a New Hospital Partner

1. Copy `openclaw/partners/health.json.example` to `openclaw/partners/health.json`
2. Fill in your hospital's API base URL, contact info, and clinic data
3. Map your hospital's clinic branches to city names with their `ref_id` values
4. Run `bash openclaw/sync.sh` from the `doraemon/` directory
5. Test by sending a symptom message via WhatsApp

## Trigger Keywords

The skill activates on Indonesian health-related words:

- Symptoms: sakit, batuk, flu, demam, pusing, mual, pilek, diare, migrain, vertigo, maag, etc.
- Medical: dokter, rumah sakit, hospital, jadwal, spesialis, obat, kesehatan
- Booking: buat janji, booking, appointment, daftar

## Limitations

- Appointment booking is mock-only (generates fake booking ID, always shows call center disclaimer)
- The `web_search` tool doesn't work (missing Brave API key) — all queries use `exec(curl)` directly
- API data depends on the hospital partner keeping their public endpoints available
