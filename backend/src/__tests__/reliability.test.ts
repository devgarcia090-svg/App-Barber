import { describe, expect, it } from "vitest";
import {
  buildPrewarning,
  cancelNoticeHours,
  computeReliabilityStatus,
  isLateCancellation,
} from "../services/reliability";

const settings = { riskyThreshold: 2, watchThreshold: 1, lateCancelThresholdHours: 4 };

describe("computeReliabilityStatus", () => {
  it("is RELIABLE with no strikes", () => {
    expect(computeReliabilityStatus(0, 0, settings)).toBe("RELIABLE");
  });

  it("is WATCH after a single strike", () => {
    expect(computeReliabilityStatus(1, 0, settings)).toBe("WATCH");
    expect(computeReliabilityStatus(0, 1, settings)).toBe("WATCH");
  });

  it("is RISKY once strikes reach the risky threshold", () => {
    expect(computeReliabilityStatus(1, 1, settings)).toBe("RISKY");
    expect(computeReliabilityStatus(2, 0, settings)).toBe("RISKY");
    expect(computeReliabilityStatus(3, 4, settings)).toBe("RISKY");
  });
});

describe("cancelNoticeHours", () => {
  it("computes hours between cancellation and appointment start", () => {
    const start = new Date("2026-07-11T10:00:00Z");
    const cancelledAt = new Date("2026-07-11T08:00:00Z");
    expect(cancelNoticeHours(cancelledAt, start)).toBeCloseTo(2, 5);
  });

  it("never goes negative when cancelled after the appointment time", () => {
    const start = new Date("2026-07-11T10:00:00Z");
    const cancelledAt = new Date("2026-07-11T12:00:00Z");
    expect(cancelNoticeHours(cancelledAt, start)).toBe(0);
  });
});

describe("isLateCancellation", () => {
  it("flags cancellations inside the threshold window as late", () => {
    expect(isLateCancellation(2, settings)).toBe(true);
    expect(isLateCancellation(4, settings)).toBe(false);
    expect(isLateCancellation(10, settings)).toBe(false);
  });
});

describe("buildPrewarning", () => {
  it("returns null for reliable clients", () => {
    const client = { name: "Ana", noShowCount: 0, lateCancelCount: 0, reliabilityStatus: "RELIABLE" };
    expect(buildPrewarning(client)).toBeNull();
  });

  it("warns softly for WATCH clients", () => {
    const client = { name: "Marta", noShowCount: 0, lateCancelCount: 1, reliabilityStatus: "WATCH" };
    const prewarning = buildPrewarning(client);
    expect(prewarning?.status).toBe("WATCH");
    expect(prewarning?.message).toContain("Marta");
  });

  it("escalates the message for RISKY clients", () => {
    const client = { name: "Pedro", noShowCount: 2, lateCancelCount: 1, reliabilityStatus: "RISKY" };
    const prewarning = buildPrewarning(client);
    expect(prewarning?.status).toBe("RISKY");
    expect(prewarning?.message).toMatch(/Atención/);
    expect(prewarning?.message).toContain("depósito");
  });
});
