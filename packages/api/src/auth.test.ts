import { describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => ({
  api: {
    getSession: vi.fn(),
  },
}));

vi.mock("./auth", () => ({
  getAuth: () => mockAuth,
}));

import { getAuth } from "./auth";

const mockGetSession = vi.mocked(mockAuth.api.getSession);

describe("auth.api.getSession", () => {
  it("returns null when no session cookie is present", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const req = new Request("http://localhost/api/auth/get-session");
    const result = await getAuth().api.getSession({ headers: req.headers });

    expect(result).toBeNull();
  });

  it("returns a session object for a valid session header", async () => {
    const now = new Date();
    const fakeSession = {
      session: {
        id: "sess_1",
        userId: "user_1",
        expiresAt: now,
        token: "tok_1",
        createdAt: now,
        updatedAt: now,
        ipAddress: null,
        userAgent: null,
      },
      user: {
        id: "user_1",
        email: "test@example.com",
        name: "Test User",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
        image: null,
      },
    };
    mockGetSession.mockResolvedValueOnce(fakeSession);

    const req = new Request("http://localhost/api/auth/get-session", {
      headers: { cookie: "better-auth.session_token=valid_token" },
    });
    const result = await getAuth().api.getSession({ headers: req.headers });

    expect(result).not.toBeNull();
    expect(result?.user.email).toBe("test@example.com");
    expect(result?.session.userId).toBe("user_1");
  });
});
