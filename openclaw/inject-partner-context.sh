#!/bin/bash

# Inject partner context into skill files at deploy time.
# Reads partner config JSON and replaces placeholders + injects context block.
#
# Usage: ./inject-partner-context.sh <skill-file> <partner-json>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_FILE="$1"
PARTNER_JSON="$2"

if [ -z "$SKILL_FILE" ] || [ -z "$PARTNER_JSON" ]; then
  echo "Usage: $0 <skill-file> <partner-json>"
  exit 1
fi

SKILL_PATH="$SCRIPT_DIR/$SKILL_FILE"
PARTNER_PATH="$SCRIPT_DIR/$PARTNER_JSON"

if [ ! -f "$SKILL_PATH" ]; then
  echo "Error: Skill file not found: $SKILL_PATH"
  exit 1
fi

if [ ! -f "$PARTNER_PATH" ]; then
  echo "  ⚠ No partner config for $SKILL_FILE, deploying without partner context"
  exit 0
fi

python3 - "$SKILL_PATH" "$PARTNER_PATH" << 'PYEOF'
import json, re, sys

skill_path = sys.argv[1]
partner_path = sys.argv[2]

with open(partner_path) as f:
    config = json.load(f)

with open(skill_path) as f:
    content = f.read()

p = config["partner"]

clinic_map = config.get("clinicMap", {})
clinic_lines = []
for city, info in sorted(clinic_map.items()):
    if isinstance(info, dict):
        clinic_lines.append(f"- **{city}** → `{info['ref_id']}` ({info['name']})")
    else:
        clinic_lines.append(f"- **{city}** → `{info}`")
clinic_dir = "\n".join(clinic_lines) if clinic_lines else "(no clinic map)"

spec_map = config.get("specialityMap", {})
spec_lines = []
for symptom, keyword in sorted(spec_map.items()):
    spec_lines.append(f"- {symptom} → `{keyword}`")
spec_dir = "\n".join(spec_lines) if spec_lines else "(no speciality map)"

api_base = p.get("apiBase", "")

context_block = f"""<!-- PARTNER_CONTEXT_START -->
**Partner: {p['name']}**
- Domain: {p['domain']}
- API Base: {api_base}
- Call Center: {p['callCenter']}
- WhatsApp: {p.get('whatsapp', 'N/A')}
- Booking ID Prefix: {p['bookingIdPrefix']}

All recommendations come EXCLUSIVELY from {p['domain']}. NEVER suggest other hospitals.

### Clinic Reference IDs (for API filtering)

{clinic_dir}

If user's city is not in this list, call the clinics API to find the nearest one:
```
exec(command="curl -s '{api_base}/clinic-v2/v1/master-data/clinic?page=1&per_page=50' -H 'Accept: application/json'")
```

### Symptom → API Keyword Map

{spec_dir}

### Quick API Reference

**Doctor Search (PRIMARY):**
```
exec(command="curl -s '{api_base}/clinic-v2/v1/master-data/doctor/data?keyword=[KEYWORD]&clinic_ref_id=[CLINIC_REF_ID]&page=1&per_page=5' -H 'Accept: application/json'")
```

**Articles:**
```
exec(command="curl -s '{api_base}/companyprofile/v1/web/articles?page=1&per_page=5' -H 'Accept: application/json'")
```
Article URL: `https://www.{p['domain']}/artikel/{{slug}}`

**Clinic Details (with addresses):**
```
exec(command="curl -s '{api_base}/clinics/v1/web/clinics' -H 'Accept: application/json'")
```
<!-- PARTNER_CONTEXT_END -->"""

pattern = r'<!-- PARTNER_CONTEXT_START -->.*?<!-- PARTNER_CONTEXT_END -->'
if re.search(pattern, content, re.DOTALL):
    content = re.sub(pattern, context_block, content, flags=re.DOTALL)
else:
    content += "\n" + context_block + "\n"

replacements = {
    "[PARTNER_SEARCH_SCOPE]": p.get("searchScope", ""),
    "[PARTNER_CALL_CENTER]": p.get("callCenter", ""),
    "[PARTNER_DOMAIN]": p.get("domain", ""),
    "[PARTNER_BOOKING_PREFIX]": p.get("bookingIdPrefix", ""),
    "[PARTNER_NAME]": p.get("name", ""),
    "[PARTNER_API_BASE]": p.get("apiBase", ""),
    "[PARTNER_WHATSAPP]": p.get("whatsapp", ""),
}

for placeholder, value in replacements.items():
    content = content.replace(placeholder, value)

with open(skill_path, "w") as f:
    f.write(content)

print(f"  ✓ Partner context injected: {p['name']} → {skill_path.split('/')[-1]}")
PYEOF
