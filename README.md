# SiteRoast AI — Frontend Demo

SiteRoast AI — full-stack MVP. Frontend (HTML/CSS/JS) calls a Node.js + Express backend which fetches the target website, extracts content, sends it to the Gemini (Google Generative) API, and returns structured JSON scores.

Files:
- index.html
- style.css
- script.js
- server/index.js
- package.json
- .env.example

Setup (local):
1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.
2. Open a terminal in the project root and run:

```powershell
npm install
npm start
```

3. Open http://localhost:3000 in your browser.

How it works:
- Frontend posts `{ url }` to `POST /api/analyze`.
- Server fetches the page, extracts title, meta description, headings, visible text, links, forms, CTA candidates.
- Server calls the Google Generative API (Gemini/Text-Bison) and requests a strict JSON response with the required schema.
- Server returns that JSON to the frontend which renders the dashboard.

Environment:
- Put your Gemini API key in `.env` as `GEMINI_API_KEY`.

Notes & production:
- The server uses `text-bison-001` generative model endpoint. Ensure your Google Cloud project and key have access to the Generative Language API.
- For production, secure the API key, add rate limiting, caching, request validation, and retry/error strategies when calling external sites and the Gemini API.
