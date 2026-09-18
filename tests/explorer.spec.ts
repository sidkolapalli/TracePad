import { test, expect } from "./fixtures";
import { defaultSession, STORAGE_KEY } from "../src/session";

test("explorer creates files in context, supports keyboard rename and reveals selected modules", async ({
  page,
}) => {
  const session = defaultSession();
  session.activeId = "sandbox";
  session.sidebarTab = "files";
  session.drafts.sandbox = {
    source:
      "from models.account import Account\n\naccount = Account()\nprint(account.balance)",
    files: {
      "models/__init__.py": "",
      "models/account.py":
        "class Account:\n    def __init__(self):\n        self.balance = 0\n",
      "models/transactions/ledger.py": "entries = []\n",
      "tests/test_account.py":
        "from models.account import Account\nassert Account().balance == 0\n",
      "helpers.py": "def format_balance(amount):\n    return f'{amount:.2f}'\n",
    },
    activeFile: "models/account.py",
    stdin: "",
    tests: [],
  };
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: session },
  );
  await page.goto("/");
  const folder = page.getByRole("treeitem", { name: "models", exact: true });
  const account = page.getByRole("treeitem", {
    name: "models/account.py",
    exact: true,
  });
  await expect(account).toHaveAttribute("aria-selected", "true");
  await account.focus();
  await account.press("ArrowLeft");
  await expect(folder).toBeFocused();
  await page.getByRole("button", { name: "New file", exact: true }).click();
  await expect(page.getByLabel("File path", { exact: true })).toHaveValue(
    "models/",
  );
  await page
    .getByLabel("File path", { exact: true })
    .fill("models/customer.py");
  await page.getByLabel("File path", { exact: true }).press("Enter");
  const customer = page.getByRole("treeitem", {
    name: "models/customer.py",
    exact: true,
  });
  await expect(customer).toHaveAttribute("aria-selected", "true");
  await customer.press("F2");
  await expect(page.getByLabel("File path", { exact: true })).toBeFocused();
  await page.getByLabel("File path", { exact: true }).fill("models/client.py");
  await page.getByLabel("File path", { exact: true }).press("Escape");
  await expect(customer).toBeVisible();
  await customer.press("F2");
  await page.getByLabel("File path", { exact: true }).fill("models/client.py");
  await page.getByLabel("File path", { exact: true }).press("Enter");
  await page
    .getByRole("button", { name: "Collapse folders", exact: true })
    .click();
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await expect(account).not.toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Open files" });
  await tabs
    .getByRole("tab", { name: "models/account.py", exact: true })
    .click();
  await expect(account).toBeVisible();
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(
    tabs.getByRole("tab", { name: "models/account.py", exact: true }),
  ).toContainText("account.py");
  await page.screenshot({ path: "artifacts/explorer-desktop-dark.png" });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(tabs.locator(".active")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(account).toHaveCSS("background-color", "rgb(234, 240, 254)");
  await page.screenshot({ path: "artifacts/explorer-desktop-light.png" });
  await account.press("F2");
  await page.screenshot({ path: "artifacts/explorer-inline-rename.png" });
  await page.getByLabel("File path", { exact: true }).press("Escape");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("tab", { name: "Files", exact: true }).click();
    await expect(account).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Rename models/account.py",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `artifacts/explorer-mobile-${width}.png` });
  }
});
