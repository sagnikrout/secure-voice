import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { transformOpusSdp, generateSafetyCode } from "../utils/webrtc";

describe("Property-Based Fuzz Testing (Adversarial Robustness)", () => {
  it("transformOpusSdp survives arbitrary garbage SDP input without throwing exceptions", () => {
    fc.assert(
      fc.property(fc.string(), (garbageSdp) => {
        try {
          const transformed = transformOpusSdp(garbageSdp);
          // Either it transforms, or it returns the input unchanged (if it couldn't parse it)
          expect(typeof transformed).toBe("string");
        } catch (e) {
          throw new Error(`Fuzzing crashed transformOpusSdp: ${e}`);
        }
      }),
      { numRuns: 1000 }
    );
  });

  it("generateSafetyCode survives arbitrary garbage input without throwing exceptions", async () => {
    // generateSafetyCode handles async so we test in a loop or handle promises
    // Wait, vitest and fast-check async property:
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (localSdp, remoteSdp) => {
        try {
          const code = await generateSafetyCode(localSdp, remoteSdp);
          // Must either be an 8 digit string or null
          if (code !== null) {
            expect(code).toMatch(/^\d{8}$/);
          } else {
            expect(code).toBeNull();
          }
        } catch (e) {
          throw new Error(`Fuzzing crashed generateSafetyCode: ${e}`);
        }
      }),
      { numRuns: 1000 }
    );
  });
});
