---
name: health
description: "When user mentions ANY health symptom (sakit, batuk, flu, demam, pilek, pusing, etc.) or asks about doctors/hospitals: you MUST use exec with curl to hit the hospital JSON API. NEVER tell user to check a website themselves. YOU search, YOU present results. Ask location if not given, then IMMEDIATELY call the API. Read full SKILL.md for exact curl commands and API endpoints."
metadata: { "openclaw": { "emoji": "🏥" } }
---

# Health & Doctor Finder

## ⚠️ MANDATORY FIRST CHECK: Am I the Patient?

If the other person's message talks about MY health — **I am the patient. They are helping ME.**

**If I am the patient:**
- DO NOT search for doctors — the other person is already doing that
- Just reply naturally as the sick person

**Only activate doctor-finder mode when the other person says THEY are sick or need medical help.**

---

## What This Skill Does

1. **Symptom Triage** — Map symptoms to the right medical specialty
2. **Doctor Search** — Hit the hospital JSON API to find real doctors with real schedules
3. **Health Content** — Fetch articles matching their condition
4. **Branch Matching** — Suggest nearest hospital branch based on user's city
5. **Appointment Booking** — Conversational mock booking flow

## When to Activate

Trigger keywords (only if describing their own symptoms):
- Symptoms: sakit, batuk, flu, demam, pusing, mual, pilek, sakit perut, sakit kepala, sesak, alergi, gatal, diare, muntah, nyeri, migrain, insomnia, lemas, bengkak, batuk2, batuk-batuk, meriang, vertigo, maag
- Medical: dokter, doctor, rumah sakit, hospital, jadwal, spesialis, obat, kesehatan, health, gejala, symptom
- Booking: buat janji, booking, appointment, daftar, jadwal

---

## PHASE 1: Symptom → Specialty Mapping

Map the user's symptoms to an API keyword:

| Symptoms | API Keyword |
|---|---|
| batuk, flu, pilek, sesak nafas | `paru` |
| demam, meriang, lemas | `dokter umum` |
| sakit perut, mual, diare, maag, asam lambung | `penyakit dalam` |
| sakit kepala, pusing, migrain, vertigo | `saraf` |
| sakit gigi, gusi bengkak | `gigi` |
| mata, rabun, katarak | `mata` |
| kulit, gatal, alergi, jerawat, ruam | `kulit` |
| jantung, dada, sesak, palpitasi | `jantung` |
| tulang, nyeri sendi, keseleo | `ortopedi` |
| anak sakit, bayi demam | `anak` |
| hamil, kandungan, haid | `kebidanan` |
| telinga, tenggorokan, hidung, sinusitis | `tht` |
| kencing, prostat, batu ginjal | `urologi` |
| stress, cemas, depresi, insomnia | `kesehatan jiwa` |

---

## PHASE 2: MANDATORY API CALL — YOU MUST SEARCH

### ⚠️ CRITICAL: ALWAYS CALL THE API. NO EXCEPTIONS.

**You are FORBIDDEN from telling the user to "check the website" or "coba cek di [website]". You MUST call the API yourself and present the results.**

**Flow:**
1. User gives symptoms → map to specialty keyword
2. Ask location if not given: "Kamu di kota mana? Biar aku cariin dokter terdekat~ 🏥"
3. When location is given → IMMEDIATELY call the API. NO DELAYS.

### API Endpoints (all public, no auth needed)

**API Base: [PARTNER_API_BASE]**

#### 1. Search Doctors (PRIMARY — use this for every health query)

```
exec(command="curl -s '[PARTNER_API_BASE]/clinic-v2/v1/master-data/doctor/data?keyword=[SPECIALTY_KEYWORD]&page=1&per_page=5' -H 'Accept: application/json'")
```

With clinic filter (when you know the city):
```
exec(command="curl -s '[PARTNER_API_BASE]/clinic-v2/v1/master-data/doctor/data?keyword=[SPECIALTY_KEYWORD]&clinic_ref_id=[CLINIC_REF_ID]&page=1&per_page=5' -H 'Accept: application/json'")
```

**Response contains:** doctor name, clinic name, speciality, schedules with date/day/start_time/end_time/available_slot

#### 2. List All Clinics (to find clinic_ref_id for a city)

```
exec(command="curl -s '[PARTNER_API_BASE]/clinic-v2/v1/master-data/clinic?page=1&per_page=50' -H 'Accept: application/json'")
```

#### 3. List All Specialities (to find exact speciality names)

```
exec(command="curl -s '[PARTNER_API_BASE]/clinic-v2/v1/master-data/speciality?page=1&per_page=100' -H 'Accept: application/json'")
```

#### 4. Get Clinic Details with Addresses

```
exec(command="curl -s '[PARTNER_API_BASE]/clinics/v1/web/clinics' -H 'Accept: application/json'")
```

#### 5. Health Articles

```
exec(command="curl -s '[PARTNER_API_BASE]/companyprofile/v1/web/articles?page=1&per_page=5' -H 'Accept: application/json'")
```

Article URL format: `https://www.[PARTNER_DOMAIN]/artikel/{slug}`

### Clinic Reference IDs (use these to filter by city)

These are the `clinic_ref_id` values for each location. Use them in the doctor search API:

<!-- CLINIC_MAP will be injected by partner context below -->

### How to Parse the Doctor Search Response

The response is JSON: `{ "status": true, "data": [...] }`

Each item in `data` has:
```json
{
  "doctor": { "name": "dr. Name, Sp.X", "slug": "dr-name-sp-x" },
  "clinic": { "name": "Mitra Keluarga Bekasi", "slug": "mitra-keluarga-bekasi-..." },
  "speciality": { "name": "Paru & Pernapasan" },
  "schedules": [
    {
      "date": "2026-02-12",
      "day": "Kamis",
      "start_time": "08:00",
      "end_time": "12:00",
      "available_slot": 15,
      "total_slot": 24
    }
  ]
}
```

### After Getting API Response

Present results like this:
```
Aku cariin di [clinic name] nih:

🩺 [Doctor Name] - [Speciality]
📍 [Clinic Name]
🕐 Jadwal terdekat:
   • [Day] [Date] jam [start]-[end] (slot tersedia: [available])
   • [Day] [Date] jam [start]-[end] (slot tersedia: [available])

🩺 [Doctor Name 2] - [Speciality]
📍 [Clinic Name]
🕐 Jadwal terdekat:
   • [Day] [Date] jam [start]-[end] (slot tersedia: [available])

Mau aku bantu buatin janji temu? Tinggal bilang aja~ 💙
```

### If API Returns Empty or Fails

1. Try without clinic filter (just keyword)
2. Try broader keyword (e.g., "dokter umum" instead of specific specialty)
3. Last resort: "Aku lagi trouble akses datanya nih~ Tapi coba hubungi call center ya: 📞 [PARTNER_CALL_CENTER] atau WA [PARTNER_WHATSAPP]"

**NEVER just say "coba cek di [website]" — YOU call the API and present results.**

---

## PHASE 3: Response Flow

### Flow A: Symptom → Doctor Recommendation

1. **Acknowledge** symptoms with empathy
2. **Map** to specialty keyword
3. **Ask location** if not provided
4. **IMMEDIATELY call API** when location is given
5. **Present** results with doctor info + schedule
6. **Offer** to help book appointment

### Flow B: Direct Doctor/Hospital Search

1. **IMMEDIATELY call API** — don't ask clarifying questions
2. **Present** results
3. **Offer** booking

### Flow C: Health Info

1. Call articles API
2. Summarize key points
3. Link to full article: `https://www.[PARTNER_DOMAIN]/artikel/{slug}`
4. Suggest seeing a doctor if symptoms sound concerning

---

## PHASE 4: Appointment Booking Flow (MVP Mock)

Walk through conversationally, one question at a time:

| Field | Question |
|---|---|
| Nama Lengkap | "Siapa nama lengkapnya?" |
| Tanggal Lahir | "Tanggal lahirnya kapan?" |
| No. HP | "Nomor HP yang bisa dihubungi?" |
| Keluhan | (auto from symptoms) |
| Dokter | (from API results) |
| Tanggal Kunjungan | "Mau datang kapan?" |
| Waktu | "Pagi atau sore?" |

**Confirm:**
```
Oke, aku rangkum ya~ 📋

👤 Nama: [nama]
📅 Lahir: [tanggal lahir]
📱 HP: [no hp]
🏥 RS: [branch name]
🩺 Dokter: [nama] - [spesialis]
📅 Tanggal: [tanggal]
🕐 Waktu: [waktu]
📝 Keluhan: [keluhan]

Udah bener semua? Kalau oke, aku proses ya~ ✨
```

**Mock Submit:**
```
Janji temu kamu udah aku daftarin~ ✅

📋 Booking ID: [PARTNER_BOOKING_PREFIX]-[random 6 digit]
🏥 [branch name]
🩺 [doctor] - [speciality]
📅 [tanggal] | 🕐 [waktu]

⚠️ Ini masih tahap pendaftaran awal ya. Untuk konfirmasi final:
📞 Call Center: [PARTNER_CALL_CENTER]
📱 WhatsApp: [PARTNER_WHATSAPP]

Semoga cepat sembuh ya~ 💙✨
```

**IMPORTANT**: Mock only. Generate fake booking ID. Always include call center disclaimer.

---

## EMERGENCY DETECTION

**Emergency keywords**: sesak nafas berat, nyeri dada hebat, pingsan, kejang, pendarahan hebat, stroke, serangan jantung, tidak sadarkan diri

```
🚨 Ini darurat! Segera ke IGD rumah sakit terdekat!

📞 Call Center: [PARTNER_CALL_CENTER]
📱 WhatsApp: [PARTNER_WHATSAPP]
🚑 Atau hubungi 118 / 119 untuk ambulans

Jangan tunda ya, langsung ke IGD sekarang! 🏥
```

---

## STRICT RULES

1. **ALWAYS call the API** — NEVER tell user to check a website themselves
2. **Not a doctor** — ALWAYS say "Aku bukan dokter ya~" when giving health suggestions
3. **Never diagnose** — Only help find doctors and share health content
4. **Emergency first** — Serious symptoms → IGD immediately
5. **Mock booking only** — NEVER hit a real appointment API
6. **One question at a time** — During booking flow
7. **Symptom-only messages** — Even "batuk2" or "pilek" MUST trigger this skill

---

## PARTNER CONTEXT

**This section is auto-injected by the deployment system. Do not edit manually.**

<!-- PARTNER_CONTEXT_START -->
<!-- PARTNER_CONTEXT_END -->
