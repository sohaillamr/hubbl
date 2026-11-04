# Huddl interactive demo

A browser-based concept demo for Huddl, a daily workplace question and live office display.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. `npm test` checks the main demo interactions. `npm run build` creates the Vercel-ready `dist/` folder.

## Demo pages

- `/#/` — landing page
- `/#/demo` — office display
- `/#/vote` — employee vote flow
- `/#/admin` — HR question and brand controls

Votes and settings are stored in this browser's `localStorage` and synchronized between tabs on the same device. The QR code points to the vote page, but votes made on a different device will not reach this display yet. This is a concept demo, not a production multi-company service.

The HR studio supports 2–8 answer choices, Egyptian-themed question presets, a live preview, and company logo upload. Logo colors are sampled locally in the browser; the logo and chosen accent are saved with the demo settings when changes are published. Publishing a different question or choice set resets the old demo votes.

## Production next steps

Add Supabase Auth, organization-scoped tables and Row Level Security, server-side vote validation, private photo storage and moderation, Realtime Broadcast, email delivery, and an approved-question workflow. Keep photo sharing optional. Add Groq only to generate HR-reviewable drafts; never expose its API key to the browser.
