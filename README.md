<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/lockup-on-dark.svg">
    <img src="apps/web/public/lockup.svg" alt="Applied" height="72">
  </picture>

  <p>Finds and scores LinkedIn jobs against your resume, tailors a resume and cover letter for each one, and can fill out the application for you.</p>
</div>

## Why this exists

Job hunting on LinkedIn usually means running the same search every day, scrolling through every result by hand, rewriting your resume for each role, and tracking what you applied to in a spreadsheet. Applied automates that grind so you can spend your time on the applications that matter.

## Features

- **Scheduled search**: scrapes LinkedIn for new postings matching your titles, skills and locations, several times a day
- **Resume scoring**: every job is scored 0–100 against your resume, so you can triage without reading each posting
- **No noise**: duplicates and postings matching your excluded keywords or companies are skipped
- **Tailored resume & cover letter**: generate ATS-friendly PDFs tailored to a job's description, then edit, preview and download them
- **Built-in tracker**: move jobs from review → applied → interviewing → rejected, filter and sort by score, status or workplace type, and see your history with each company
- **AI application filling** (optional): select jobs and an agent fills out and submits each application in a real browser, using that job's tailored documents. It only runs on the jobs you pick, when you click **Apply now**

<p align="center">
  <img src=".github/screenshot-dashboard.png" alt="Applied dashboard showing application stats, weekly activity, agent status, and search criteria" width="800">
</p>

## How it works

1. Fill in your profile: target titles, skills, resume and locations
2. Click **Search jobs**. Matching postings appear in the dashboard, each with a score
3. Open a job to generate a tailored resume and cover letter and apply yourself, or select jobs and click **Apply now** to let the agent do it
4. New searches run automatically every 4 hours from 9am to 5pm. Change this under **Settings → Job search**. Scheduled searches only find and score jobs; they never apply

## Getting started

**You'll need:** [Docker](https://docs.docker.com/get-docker/) with Compose v2.20+ (ships with Docker Desktop 4.22+), a LinkedIn account, and a [v0.dev/gateway](https://v0.dev/gateway) AI key.

```bash
mkdir applied && cd applied
curl -O https://raw.githubusercontent.com/tonghohin/applied/main/docker-compose.yml
docker compose up -d
```

This pulls the images, starts everything and runs migrations. Then open [http://localhost:8420](http://localhost:8420), create an account, add your AI key under **Settings → AI provider**, and fill in your profile and LinkedIn login.

To update: `docker compose pull && docker compose up -d`

## Limitations

- **Keep the schedule running daily.** Each search only looks at jobs posted in the last 24 hours (up to ~125 per location and workplace type), and days the schedule skips aren't caught up later
- **The agent can't finish every application.** Some application sites block bots, some forms are too unusual, and it can't sign up for an employer's own portal. Failed applications are marked `failed` so you can finish them yourself
- **Review AI-written documents before sending.** They're instructed to use only facts from your resume. The PDFs can't show some symbols (→, ≥, ✓), emoji or Chinese, Japanese and Korean text

## Contributing

Please read the [contributing guide](CONTRIBUTING.md).

## Disclaimer

This tool automates interactions with LinkedIn in ways that may violate their [User Agreement](https://www.linkedin.com/legal/user-agreement). Use it at your own risk. The authors are not responsible for any consequences, including account suspension or legal action.
