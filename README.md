<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/lockup-on-dark.svg">
    <img src="apps/web/public/lockup.svg" alt="Applied" height="72">
  </picture>

  <p>Automated job application tool — find, score, and apply to LinkedIn positions hands-free.</p>
</div>

## Why this exists

Job hunting on LinkedIn usually means running the same search every day, scrolling through every result by hand, and tracking whatever you apply to in a separate spreadsheet. This tool automates that:

- **Filters the noise** — runs your search and drops postings that match your excluded keywords or companies, or that you've already seen
- **Replaces the spreadsheet** — every job it finds is saved with a status (`pending_review`, `applied`, `interviewing`, `rejected`, `skipped`), so it's a job board and tracker in one place
- **Applies, if you want it to** — AI filling out and submitting applications is the feature on top, not the point; you can use this purely as a scraper and tracker and apply yourself

## How it works

1. Fill in your profile — target job titles, skills, resume, and location preferences
2. Click **Search Jobs** — the scraper finds matching LinkedIn postings and scores each one
3. Review results in the dashboard — each job is scored 0–100 against your resume by an LLM
4. Select jobs and click **Apply now** — an AI agent fills out and submits each application, generating a personalized cover letter and PDF resume on the fly
5. Optionally configure a schedule to run searches automatically on a daily or weekly cron

## Job tracking

Every job found by a search is saved and stays in your dashboard whether or not you ever apply to it — so the app works as a standalone job board even if you skip Easy Apply entirely.

- **Status pipeline** — each job starts at `pending_review` and can be moved to `applied`, `interviewing`, `rejected`, or `skipped` manually from the dashboard (`applying`/`failed` are set automatically when the AI agent runs)
- **Search + filter + sort** — filter by status or workplace type (on-site/remote/hybrid), search by title/company/location, sort by score or recency
- **Score at a glance** — every job carries its 0–100 LLM match score, so you can triage without re-reading each posting
- **Company history** — the detail view shows how many times you've applied to or been rejected by that company before, and which titles
- **One-click back to source** — every job links back to the original LinkedIn posting
- **Smart deduplication** — skips jobs already in your dashboard by URL, and (if enabled) by matching company + title + location, so re-running a search doesn't flood you with the same postings; exclude keywords and companies you never want to see

## AI application filling

For each job you select, an AI agent generates a tailored cover letter and a resume PDF from your profile, then drives a real browser to fill out and submit the application — LinkedIn Easy Apply, plus external redirects to other ATS platforms.

It's still improving, with real limitations worth knowing before you rely on it:

- **Bot detection varies by platform** — some ATS platforms flag or block automated submissions more aggressively than others; a job can fail for this reason alone, independent of your profile or answers
- **Can't handle "create an account first"** — if an application requires signing up for the employer's own portal before you can apply, the agent can't get through that step
- **Not every form is covered** — custom or unusual application forms can trip it up; a failed application shows up as `failed` in your dashboard so you can finish it yourself

## Getting started

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) with Compose v2.20+ (ships with Docker Desktop 4.22+)

### 1. Get the compose file

No clone needed — just this one file:

```bash
mkdir applied && cd applied
curl -O https://raw.githubusercontent.com/tonghohin/applied/main/docker-compose.yml
```

### 2. Start it

```bash
docker compose up -d
```

Pulls the published images, starts everything (database, queue, web app, worker), and runs migrations automatically.

> **Before exposing this to the internet:** put `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `ENCRYPTION_KEY` (`openssl rand -hex 32`) in a `.env` file next to `docker-compose.yml` — otherwise it starts with insecure defaults meant only for local use.

### 3. Open the app

Go to [http://localhost:8420](http://localhost:8420), create an account, add your [v0.dev/gateway](https://v0.dev/gateway) AI key under **Settings → AI provider**, then fill in your profile and LinkedIn login.

### Updating

```bash
docker compose pull && docker compose up -d
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup, commands, and architecture notes.

## Disclaimer

This tool automates interactions with LinkedIn in ways that may violate their [User Agreement](https://www.linkedin.com/legal/user-agreement). Use it at your own risk. The authors are not responsible for any consequences including account suspension or legal action.
