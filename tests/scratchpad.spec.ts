import {
  test,
  expect,
  readProjectState,
  expectPythonStatus,
  type Page,
} from "./fixtures";
import { readFile } from "node:fs/promises";

async function pad(page: Page) {
  await page.getByRole("tab", { name: "Scratchpad", exact: true }).click();
}
async function choose(page: Page, title: string) {
  await page.getByRole("tab", { name: "Brief", exact: true }).click();
  await page.getByRole("button", { name: "Practice library" }).click();
  await page.getByLabel("Search exercises").fill(title);
  await page
    .locator(".library-list")
    .getByRole("button")
    .filter({ hasText: title })
    .click();
}

test("notes and trace tables save per question, undo structural edits, and survive project backups", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await pad(page);
  await page
    .getByLabel("Scratchpad notes", { exact: true })
    .fill("Clarify: can the same element be used twice?");
  await page
    .getByLabel("Scratchpad notes", { exact: true })
    .press("ControlOrMeta+Enter");
  await expect(page.locator(".output-status")).toContainText("Ready");
  await page.getByRole("tab", { name: "Trace table", exact: true }).click();
  await page.getByLabel("Column 2 name", { exact: true }).fill("seen");
  await page.getByLabel("Row 1, Step", { exact: true }).fill("i = 0");
  await page.getByLabel("Row 1, seen", { exact: true }).fill("{}");
  await page
    .getByLabel("Row 1, Observation", { exact: true })
    .fill("Need 7; store 2 at index 0");
  await page
    .getByRole("button", { name: "Duplicate row 1", exact: true })
    .click();
  await expect(page.getByLabel("Row 4, seen", { exact: true })).toHaveValue(
    "{}",
  );
  await page
    .getByRole("button", { name: "Undo scratchpad edit", exact: true })
    .click();
  await expect(page.getByLabel("Row 4, seen", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Redo scratchpad edit", exact: true })
    .click();
  await expect(page.getByLabel("Row 4, seen", { exact: true })).toHaveValue(
    "{}",
  );
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  await page.getByLabel("Column 4 name", { exact: true }).fill("result");
  await page.getByLabel("Row 1, result", { exact: true }).fill("pending");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export scratchpad JSON", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("Pair-sum-scratchpad.json");
  await expect
    .poll(async () => {
      const s = await readProjectState(page);
      return s.session.drafts[s.session.activeId].scratchpad?.trace.columns
        .length;
    })
    .toBe(4);
  await page.reload();
  await expect(page.getByLabel("Row 1, result", { exact: true })).toHaveValue(
    "pending",
  );
  await expect(
    page.getByRole("button", { name: "Duplicate row 1", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Scroll columns right", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Scroll columns left", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Scroll columns left", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/scratchpad-trace-desktop.png",
    animations: "disabled",
  });
  await choose(page, "Binary search");
  await pad(page);
  await expect(
    page.getByLabel("Scratchpad notes", { exact: true }),
  ).toHaveValue("");
  await choose(page, "Pair sum");
  await pad(page);
  await expect(page.getByLabel("Row 1, result", { exact: true })).toHaveValue(
    "pending",
  );
  await page.getByRole("button", { name: /Switch project:/ }).click();
  const backup = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  const backupPath = await (await backup).path();
  await page
    .getByRole("button", { name: "Import backup", exact: true })
    .click();
  await page.getByLabel("Import project backup").setInputFiles(backupPath!);
  await pad(page);
  await expect(page.getByLabel("Row 1, result", { exact: true })).toHaveValue(
    "pending",
  );
});

test("scratchpad uses mobile navigation and preserves execution results while editing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run tests", exact: true }).click();
  // Cases report individually. Preserve the final suite result, not a partial
  // count that may still change while the scratchpad is being edited.
  await expectPythonStatus(page, "Failed");
  await expect(page.locator(".test-summary")).toContainText("4 failed");
  const result = await page.locator(".test-summary").innerText();
  await pad(page);
  await page
    .getByLabel("Scratchpad notes", { exact: true })
    .fill("Revisit the failed edge case.");
  await expect(page.locator(".test-summary")).toHaveText(result);
  await page
    .getByRole("button", { name: "Expand scratchpad", exact: true })
    .click();
  await expect(page.locator(".coding-pane")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Return to split workspace", exact: true })
    .click();
  await expect(page.locator(".coding-pane")).toBeVisible();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await pad(page);
    await page.getByRole("tab", { name: "Trace table", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "Scratchpad", exact: true }),
    ).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Add row", exact: true }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: "artifacts/scratchpad-trace-mobile.png",
    animations: "disabled",
  });
  await page.getByRole("tab", { name: "Scratchpad", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: "Code", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".monaco-editor")).toBeVisible();
});

test("a delayed animation frame cannot move flowchart typing into a different field", async ({
  page,
}) => {
  await page.goto("/");
  await pad(page);
  await page.getByRole("tab", { name: "Flowchart", exact: true }).click();
  // Hold application animation callbacks to reproduce a busy rendering thread.
  // Browser input and Playwright's own rendering checks continue normally.
  const frames = await page.evaluateHandle(() => {
    const request = window.requestAnimationFrame;
    const cancel = window.cancelAnimationFrame;
    const queued = new Map<number, FrameRequestCallback>();
    let id = -1;
    window.requestAnimationFrame = (callback) => {
      queued.set(id, callback);
      return id--;
    };
    window.cancelAnimationFrame = (handle) => {
      if (!queued.delete(handle)) cancel.call(window, handle);
    };
    return {
      release() {
        window.requestAnimationFrame = request;
        window.cancelAnimationFrame = cancel;
        for (const callback of queued.values()) callback(performance.now());
        queued.clear();
      },
    };
  });
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  const label = page.getByLabel("Step label", { exact: true });
  await label.fill("Store seen values");
  const x = page.getByLabel("X", { exact: true });
  await x.focus();
  await expect(x).toBeFocused();
  await frames.evaluate((held) => held.release());
  await frames.dispose();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("90");
  await expect(x).toHaveValue("90");
  await expect(label).toHaveValue("Store seen values");
  await expect(
    page.getByRole("button", { name: "Step: Store seen values", exact: true }),
  ).toBeVisible();
});

test("flowcharts support labelled connections, keyboard and drag movement, undo, SVG export and reload", async ({
  page,
}) => {
  await page.goto("/");
  await pad(page);
  await page.getByRole("tab", { name: "Flowchart", exact: true }).click();
  const add = async (type: string, label: string, x: number, y: number) => {
    await page
      .getByRole("button", { name: `Add ${type}`, exact: true })
      .click();
    await page.getByLabel("Step label", { exact: true }).fill(label);
    await page.getByLabel("X", { exact: true }).fill(String(x));
    await page.getByLabel("Y", { exact: true }).fill(String(y));
  };
  await add("start", "Read input", 90, 30);
  await add("step", "Store seen values", 90, 140);
  await add("decision", "Complement found?", 80, 280);
  await add("end", "Return indices", 90, 460);
  const select = page.getByRole("combobox", {
    name: "Select a step or connection",
    exact: true,
  });
  const connect = async (source: string, target: string, label = "") => {
    await select.selectOption({ label: source });
    await page
      .getByRole("combobox", { name: "Connect to", exact: true })
      .selectOption({ label: target });
    await page
      .getByLabel("Arrow label (optional)", { exact: true })
      .fill(label);
    await page
      .locator(".flow-connect-fields")
      .getByRole("button", { name: "Connect", exact: true })
      .click();
  };
  await page
    .getByRole("button", { name: "Fit flowchart", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start: Read input", exact: true })
    .click();
  await page.locator(".flow-connect-button").click();
  await page
    .getByRole("button", { name: "Step: Store seen values", exact: true })
    .click();
  await expect(page.locator(".flow-edge")).toHaveCount(1);
  await connect("2. Store seen values", "Complement found?");
  await connect("3. Complement found?", "Return indices", "Yes");
  await expect(page.locator(".flow-edge")).toHaveCount(3);
  await select.selectOption({ label: "3. Complement found?" });
  await page.locator(".flow-inspector > summary").click();
  await page
    .getByRole("button", { name: "Fit flowchart", exact: true })
    .click();
  const decision = page.getByRole("button", {
    name: "Decision: Complement found?",
    exact: true,
  });
  await decision.focus();
  await page.keyboard.press("ArrowRight");
  const saved = async () =>
    (await readProjectState(page)).session.drafts["pair-sum"].scratchpad!;
  await expect.poll(async () => (await saved()).flow.nodes[2].x).toBe(90);
  const box = await decision.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 25,
    box!.y + box!.height / 2 + 10,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await saved()).flow.nodes[2].x)
    .toBeGreaterThan(90);
  await page
    .getByRole("button", { name: "Undo scratchpad edit", exact: true })
    .click();
  await expect.poll(async () => (await saved()).flow.nodes[2].x).toBe(90);
  await page.screenshot({
    path: "artifacts/scratchpad-flow-desktop.png",
    animations: "disabled",
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export flowchart as SVG", exact: true })
    .click();
  const svg = await readFile((await (await download).path())!, "utf8");
  expect(svg).toContain("Store seen values");
  expect(svg).toContain("marker-end");
  expect(svg).not.toContain("var(--");
  await page.reload();
  await expect(page.locator(".flow-node")).toHaveCount(4);
  await expect(page.locator(".flow-edge")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Expand scratchpad", exact: true })
    .click();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page
    .getByRole("button", { name: "Fit flowchart", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/scratchpad-flow-expanded-light.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Return to split workspace", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await pad(page);
  await page
    .getByRole("button", { name: "Fit flowchart", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/scratchpad-flow-mobile.png",
    animations: "disabled",
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".flow-inspector > summary").click();
    await select.selectOption({ label: "2. Store seen values" });
    await expect(page.getByLabel("Step label", { exact: true })).toBeVisible();
    await page.locator(".flow-inspector > summary").click();
  }
  await page.locator(".flow-inspector > summary").click();
  await page
    .getByRole("button", { name: "Delete selected step", exact: true })
    .click();
  await expect(page.locator(".flow-node")).toHaveCount(3);
  await expect(page.locator(".flow-edge")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Undo scratchpad edit", exact: true })
    .click();
  await expect(page.locator(".flow-node")).toHaveCount(4);
  await expect(page.locator(".flow-edge")).toHaveCount(3);
});
