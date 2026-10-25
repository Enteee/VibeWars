import { expect, test } from "@playwright/test";

// Throwaway for #216's PR testing: fails about 1 run in 3. Reverted next commit.
test("a deliberately flaky test", () => {
  expect(Math.random() < 0.33).toBe(false);
});
