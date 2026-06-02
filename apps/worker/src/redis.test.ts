import superjson from "superjson";
import { describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

const { mockPublish, mockOn, mockQuit } = vi.hoisted(() => ({
  mockPublish: vi.fn().mockResolvedValue(1),
  mockOn: vi.fn(),
  mockQuit: vi.fn().mockResolvedValue("OK"),
}));

vi.mock("ioredis", () => ({
  default: vi.fn(function (this: Record<string, unknown>) {
    this.publish = mockPublish;
    this.on = mockOn;
    this.quit = mockQuit;
  }),
}));

import type { SseEvent } from "@repo/api";
import { closeRedisPublisher, publishEvent } from "./redis";

const mockSearchRun = {
  id: "run-1",
  userId: "user-1",
  platform: "linkedin" as const,
  status: "completed" as const,
  startedAt: new Date("2026-01-01T10:00:00Z"),
  completedAt: new Date("2026-01-01T10:05:00Z"),
  jobCount: 5,
  errorMessage: null,
  searchCriteria: null,
};

const mockApplyRun = {
  id: "apply-1",
  jobId: "job-1",
  userId: "user-1",
  status: "running" as const,
  startedAt: new Date("2026-01-01T11:00:00Z"),
  completedAt: null,
  errorMessage: null,
  logs: [],
};

describe("publishEvent", () => {
  it("publishes to the correct user channel", () => {
    const event: SseEvent = { type: "search-run:update", run: mockSearchRun };
    publishEvent("user-1", event);
    expect(mockPublish).toHaveBeenCalledWith("events:user-1", expect.any(String));
  });

  it("serializes the event with superjson so Dates survive round-trip", () => {
    const event: SseEvent = { type: "search-run:update", run: mockSearchRun };
    publishEvent("user-1", event);
    const [, payload] = mockPublish.mock.calls.at(-1) ?? [];
    const parsed = superjson.parse<SseEvent>(payload);
    expect(parsed).toEqual(event);
    expect((parsed as typeof event).run.startedAt).toBeInstanceOf(Date);
  });

  it("publishes job:status event to the correct channel", () => {
    const event: SseEvent = {
      type: "job:status",
      jobId: "job-1",
      status: "applied",
      appliedAt: new Date("2026-01-01T12:00:00Z"),
      failureReason: null,
      updatedAt: new Date("2026-01-01T12:00:00Z"),
    };
    publishEvent("user-2", event);
    expect(mockPublish).toHaveBeenCalledWith("events:user-2", expect.any(String));
  });

  it("publishes apply-run:update event", () => {
    const event: SseEvent = { type: "apply-run:update", jobId: "job-1", run: mockApplyRun };
    publishEvent("user-1", event);
    expect(mockPublish).toHaveBeenCalledWith("events:user-1", expect.any(String));
  });

  it("publishes apply-run:log event", () => {
    const event: SseEvent = {
      type: "apply-run:log",
      jobId: "job-1",
      runId: "apply-1",
      log: { timestamp: "2026-01-01T11:01:00.000Z", message: "Starting application" },
    };
    publishEvent("user-1", event);
    expect(mockPublish).toHaveBeenCalledWith("events:user-1", expect.any(String));
  });
});

describe("closeRedisPublisher", () => {
  it("calls quit on the Redis client", async () => {
    await closeRedisPublisher();
    expect(mockQuit).toHaveBeenCalled();
  });
});
