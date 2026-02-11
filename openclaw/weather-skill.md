---
name: weather
description: Get current weather and forecasts using Open-Meteo (free, no API key).
metadata: { "openclaw": { "emoji": "🌤️" } }
---

# Weather

Use Open-Meteo API (free, no API key, reliable).

## IMPORTANT: Use web_search as PRIMARY method

The `exec` tool with curl may timeout. ALWAYS try `web_search` FIRST.

### Method 1 (PREFERRED): web_search
```
web_search("cuaca [city] hari ini")
web_search("weather [city] today temperature")
```

If web_search returns weather info, use that. Done.

### Method 2 (FALLBACK): exec with curl
Only if web_search doesn't return weather data, use curl with a SHORT timeout:

```bash
curl -s --connect-timeout 5 --max-time 10 "https://api.open-meteo.com/v1/forecast?latitude=LAT&longitude=LON&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto"
```

## City Coordinates

Indonesian cities:
- Jakarta: lat=-6.17, lon=106.83
- Tangerang: lat=-6.17, lon=106.63
- Bandung: lat=-6.91, lon=107.61
- Surabaya: lat=-7.25, lon=112.75
- Bali/Denpasar: lat=-8.65, lon=115.22
- Yogyakarta: lat=-7.80, lon=110.36
- Medan: lat=3.59, lon=98.67
- Semarang: lat=-6.97, lon=110.42
- Bekasi: lat=-6.24, lon=107.00
- Depok: lat=-6.40, lon=106.82
- Bogor: lat=-6.60, lon=106.80

Other cities:
- Tokyo: lat=35.68, lon=139.69
- Singapore: lat=1.35, lon=103.82
- London: lat=51.51, lon=-0.13
- New York: lat=40.71, lon=-74.01

For unlisted cities, use geocoding:
```bash
curl -s --connect-timeout 5 --max-time 10 "https://geocoding-api.open-meteo.com/v1/search?name=CityName&count=1"
```

## Weather Codes
0=Clear ☀️, 1-3=Cloudy ☁️, 45-48=Fog 🌫️, 51-55=Drizzle 🌦️, 61-65=Rain 🌧️, 71-75=Snow ❄️, 80-82=Showers 🌧️, 95-99=Thunderstorm ⛈️

## If BOTH methods fail
Say: "Maaf, aku gak bisa cek cuaca sekarang~ Coba cek di weather.com atau BMKG ya! 🌤️"
Do NOT say "error" or "API gagal" — just suggest alternatives naturally.
