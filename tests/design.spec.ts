import { test, expect } from "./fixtures";

test("focused workspace keeps navigation contextual across themes and sizes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/revamp-desktop-dark.png",
  });
  await page.getByRole("button", { name: /Switch project:/ }).click();
  await expect(page.getByLabel("Search projects")).toBeFocused();
  await page.getByLabel("Search projects").fill("missing interview");
  await expect(page.getByText("No projects match your search.")).toBeVisible();
  await page.getByLabel("Search projects").fill("");
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/revamp-projects.png",
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /Switch project:/ }),
  ).toBeFocused();
  await page.getByRole("button", { name: /Switch project:/ }).click();
  await page.getByRole("button", { name: /Switch project:/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Switch project" }),
  ).not.toBeVisible();
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Practice library" }),
  ).not.toBeVisible();
  await page.getByRole("tab", { name: "Interview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Practice library" }),
  ).not.toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/revamp-interview.png",
  });
  await page.getByRole("tab", { name: "Brief", exact: true }).click();
  await page.getByLabel("Editor options", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reset code", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByLabel("Editor options", { exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Collapse output", exact: true })
    .click();
  await expect(page.locator(".coding-pane")).toHaveClass(/output-collapsed/);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Collapse output", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".output-status")).toContainText("Completed", {
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/revamp-desktop-light.png",
  });
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/revamp-practice.png",
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Brief", exact: true }).click();
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/revamp-mobile-brief.png",
  });
  await expect(
    page.getByRole("tab", { name: "Files", exact: true }),
  ).toHaveCount(1);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".brand > span")).toBeVisible();
    await page.getByRole("tab", { name: "Code", exact: true }).click();
    await expect(page.locator(".monaco-editor")).toBeVisible();
    const run = await page
      .getByRole("button", { name: "Run tests", exact: true })
      .boundingBox();
    expect(run!.x + run!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/revamp-mobile-code.png",
  });
});
