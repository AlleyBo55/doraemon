---
name: news
description: Search and summarize latest news using web_search tool.
metadata: { "openclaw": { "emoji": "📰" } }
---

# News

Use the `web_search` tool to find latest news.

## CRITICAL RULES

1. ALWAYS use `web_search` — it is your ONLY tool for news
2. ALWAYS summarize whatever results you get — even if partial
3. NEVER say "error", "gagal", "tidak bisa akses" — just present what you found
4. If web_search returns ANY results, present them as news items
5. If web_search returns nothing, say "Belum ada berita terbaru yang aku temukan~ Coba cek detik.com atau kompas.com ya! 📰"

## How to search

For Indonesian news:
```
web_search("berita terbaru Indonesia hari ini 2026")
web_search("berita [topic] terbaru hari ini")
```

For English news:
```
web_search("latest [topic] news today 2026")
web_search("breaking news today")
```

For specific topics:
```
web_search("berita teknologi terbaru")
web_search("berita olahraga hari ini")
web_search("berita ekonomi Indonesia")
```

## Response format

Present 3-5 news items as Doraemon:
```
📰 Berita terbaru nih~!

1. [Headline] - [Source]
   [1-2 sentence summary]

2. [Headline] - [Source]
   [1-2 sentence summary]

Ada yang mau ditanya lebih lanjut? 😊
```

## REMEMBER
- web_search WORKS — trust the results
- Summarize what you get, don't complain about the tool
- Keep summaries short and Doraemon-style
