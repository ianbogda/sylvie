# Sylvie — Netlify + GitHub backend (Option A)

## What this pack provides
- Static memorial page (`index.html`) with:
  - Photo gallery + upload (commits into `assets/` in the GitHub repo)
  - Guestbook messages stored as **GitHub Issues** labeled `guestbook`
  - Candle counter stored as **GitHub Reactions** on a dedicated issue

- Netlify Functions (serverless) to interact with GitHub:
  - `upload`    -> commit assets
  - `message`   -> create guestbook issue
  - `messages`  -> list guestbook issues
  - `candle`    -> add a reaction (one candle)
  - `candles`   -> read candle count

## GitHub setup (once)
1. In repo `ianbogda/sylvie`, create label: `guestbook`
2. Create a dedicated issue for candles, e.g. title: `🕯️ Candles counter`
3. Note its issue number and set it in Netlify env var `CANDLE_ISSUE_NUMBER`

## Netlify environment variables
Required:
- GITHUB_TOKEN
- GITHUB_OWNER=ianbogda
- GITHUB_REPO=sylvie
- GITHUB_BRANCH=main
- UPLOAD_PREFIX=assets
- MAX_UPLOAD_BYTES=6000000
- CANDLE_ISSUE_NUMBER=<number>

Recommended:
- ALLOW_ORIGINS=https://<your-netlify-domain>
- CANDLE_REACTION=heart

## Deploy
1. Import the GitHub repo into Netlify
2. Publish directory: `.`
3. Functions directory is set by netlify.toml (no build step required)

## Moderation
- Messages: remove label `guestbook` (or close the issue) to hide
- Candles: lock the candle issue to stop reactions
