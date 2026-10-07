// Lightweight entry point (`@repo/ai/tailoring`) for the web app's API layer. Keep it free of
// the apply agent, MCP and Playwright: importing those breaks the Next.js server build.
export { tailorCoverLetter } from "./tailor-cover-letter";
export { tailorResume } from "./tailor-resume";
export type { TailoringJob } from "./tailoring-job";
