import { expect } from "@playwright/test";
import { test, OPERATOR, ACCOUNT, IDENTITY, CONSENSUS, UNKNOWN_CONSENSUS, INACTIVE_OPERATOR, INACTIVE_ACCOUNT, PROFILE } from "./fixtures/explorer";

test("uses the validator account's Desmos Profile and preserves staking metadata", async ({ page, profileApi }, testInfo) => {
  await page.goto(`/validators/${OPERATOR}`);
  await expect(page.getByRole("heading", { name: "Apollo Community", exact: true })).toBeVisible();
  await expect(page.getByText("Desmos Profile", { exact: true })).toBeVisible();
  await expect(page.getByText("@apollo", { exact: true })).toBeVisible();
  await expect(page.getByText(PROFILE.bio, { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Apollo Community avatar" })).toHaveAttribute("src", PROFILE.pictures.profile);
  await expect(page.getByRole("img", { name: "Apollo Community cover" })).toBeVisible();
  await expect(page.getByText("Validator name: Staking name")).toBeVisible();
  await expect(page.getByText("Profile created: 02 Nov 2021, 16:58:41 UTC")).toBeVisible();
  await expect(page.getByRole("link", { name: "https://validator.example" })).toBeVisible();
  await expect(page.locator(`a[href="/accounts/${ACCOUNT}"]`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delegation Actions" })).toBeVisible();
  expect(profileApi.requests).toContain(`/desmos/profiles/v3/profiles/${ACCOUNT}`);
  await page.screenshot({ path: testInfo.outputPath("profile-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("img", { name: "Apollo Community cover" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("profile-mobile.png"), fullPage: true });
});

for (const scenario of ["absent", "unavailable", "different account"] as const) {
  test(`preserves validator details when the profile is ${scenario}`, async ({ page, profileApi }) => {
    if (scenario === "absent") profileApi.profile = null;
    if (scenario === "unavailable") profileApi.status = 503;
    if (scenario === "different account") profileApi.profile = { ...PROFILE, account: { address: "desmos1somebodyelse" } };
    await page.goto(`/validators/${OPERATOR}`);
    await expect(page.getByRole("heading", { name: "Staking name", exact: true })).toBeVisible();
    await expect(page.getByText("Original staking description.", { exact: true })).toBeVisible();
    await expect(page.getByText("Desmos Profile", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("img", { name: "Staking name avatar" })).toHaveAttribute("src", `/api/keybase/avatar/${IDENTITY}`);
    await expect(page.getByRole("heading", { name: "Delegation Actions" })).toBeVisible();
    const profileResponse = page.waitForResponse((response) => response.url().endsWith(`/validators/${OPERATOR}/profile`));
    await page.goto("/validators");
    expect(await (await profileResponse).json()).toBeNull();
    await expect(page.getByText("Staking name", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Staking name avatar" })).toHaveAttribute("src", `/api/keybase/avatar/${IDENTITY}`);
  });
}

test("supports vesting accounts and falls back for empty fields or invalid image URLs", async ({ page, profileApi }) => {
  profileApi.profile = { ...PROFILE, account: { base_vesting_account: { base_account: { address: ACCOUNT } } },
    nickname: "", bio: "", pictures: { profile: "javascript:alert(1)", cover: "data:text/html,unsafe" } };
  await page.goto(`/validators/${OPERATOR}`);
  await expect(page.getByRole("heading", { name: "Staking name", exact: true })).toBeVisible();
  await expect(page.getByText("@apollo", { exact: true })).toBeVisible();
  await expect(page.getByText("Original staking description.", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Staking name avatar" })).toHaveAttribute("src", `/api/keybase/avatar/${IDENTITY}`);
  await expect(page.getByRole("img", { name: /cover$/ })).toHaveCount(0);
});

test("broken profile images fall back without hiding the profile or staking actions", async ({ page, profileApi }) => {
  profileApi.brokenImages = true;
  await page.goto(`/validators/${OPERATOR}`);
  await expect(page.getByRole("img", { name: "Apollo Community avatar" })).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(page.getByRole("img", { name: "Apollo Community cover" })).toHaveCount(0);
  await expect(page.getByText("@apollo", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delegation Actions" })).toBeVisible();
});

test("resolves retired IPFS gateways without changing the profile image CID or path", async ({ page, profileApi }) => {
  const cid = "QmYeeFgvSroRRWhZNcWBkAbkdvh7fdeDTJKGkKR6i3g3vQ";
  profileApi.profile = { ...PROFILE, pictures: {
    profile: `https://cloudflare-ipfs.com/ipfs/${cid}`,
    cover: `https://cf-ipfs.com/ipfs/${cid}/cover.png?filename=cover.png`
  } };
  await page.goto(`/validators/${OPERATOR}`);
  const avatar = page.getByRole("img", { name: "Apollo Community avatar" });
  await expect(avatar).toHaveAttribute("src", `https://ipfs.desmos.network/ipfs/${cid}`);
  await expect.poll(() => avatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole("img", { name: "Apollo Community cover" })).toHaveAttribute(
    "src", `https://ipfs.desmos.network/ipfs/${cid}/cover.png?filename=cover.png`
  );
});

test("renders profile Markdown with readable lists and safe external links", async ({ page, profileApi }, testInfo) => {
  profileApi.profile = { ...PROFILE, bio: [
    "## Community projects",
    "",
    "- Building **Go-find.me**, a *social network* on Desmos.",
    "- Maintaining [DesmosJS](https://github.com/g-luca/desmosjs?tab=readme#usage).",
    "",
    "1. [Website](http://validator.example)",
    "2. [Contact us](mailto:validator@example.com)",
    "",
    "> Supporting the community with `DesmosJS`.",
    "",
    "![Community badge](https://profile-images.test/badge.svg)",
    "",
    "```text",
    "long-code-example".repeat(40),
    "```"
  ].join("\n") };
  await page.goto(`/validators/${OPERATOR}`);
  const bio = page.locator(".profile-bio");
  await expect(bio.getByRole("heading", { name: "Community projects" })).toBeVisible();
  await expect(bio.locator("ul > li")).toHaveCount(2);
  await expect(bio.locator("ol > li")).toHaveCount(2);
  await expect(bio.locator("strong")).toHaveText("Go-find.me");
  await expect(bio.locator("em")).toHaveText("social network");
  await expect(bio.locator("blockquote code")).toHaveText("DesmosJS");
  const link = bio.getByRole("link", { name: "DesmosJS", exact: true });
  await expect(link).toHaveAttribute("href", "https://github.com/g-luca/desmosjs?tab=readme#usage");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(bio.getByRole("link", { name: "Website", exact: true })).toHaveAttribute("href", "http://validator.example/");
  await expect(bio.getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "mailto:validator@example.com");
  await expect(bio.getByRole("img", { name: "Community badge" })).toHaveAttribute("referrerpolicy", "no-referrer");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("profile-markdown-mobile.png"), fullPage: true });
});

test("removes raw HTML and unsafe bio URLs while retaining link text", async ({ page, profileApi }) => {
  const unsafeLinks = [
    ["Script link", "javascript:alert(1)"],
    ["Mixed-case scheme", "JaVaScRiPt:alert(1)"],
    ["Encoded scheme", "&#106;avascript&#58;alert(1)"],
    ["Control character", "java&#x09;script:alert(1)"],
    ["Data link", "data:text/html,unsafe"],
    ["VBScript link", "vbscript:msgbox(1)"],
    ["File link", "file:///etc/passwd"],
    ["Credential link", "https://trusted.example@untrusted.example/path"],
    ["Relative link", "/wallet"],
    ["Protocol-relative link", "//untrusted.example/path"]
  ];
  profileApi.profile = { ...PROFILE, bio: [
    ...unsafeLinks.map(([label, url]) => `[${label}](${url})`),
    "",
    '![Blocked image](data:image/svg+xml,unsafe)',
    '![Email image](mailto:validator@example.com)',
    "",
    '<script>window.__profileBioExecuted = true</script>',
    "",
    '<iframe src="https://untrusted.example"></iframe>',
    "",
    '<iframe srcdoc="<script>parent.__profileBioExecuted = true</script>"></iframe>',
    "",
    '<object data="https://untrusted.example/embed"></object>',
    "",
    '<embed src="https://untrusted.example/embed">',
    "",
    '<style>body { display: none; }</style>',
    "",
    '<link rel="stylesheet" href="https://untrusted.example/style.css">',
    "",
    '<form action="https://untrusted.example"><input name="seed"><button>Submit</button></form>',
    "",
    '<svg onload="window.__profileBioExecuted = true"></svg>',
    "",
    '<math><mtext><img src="x" onerror="window.__profileBioExecuted = true"></mtext></math>',
    "",
    '<img src="https://untrusted.example/pixel" onerror="window.__profileBioExecuted = true">',
    "",
    '<a href="javascript:alert(1)">Raw HTML link</a>',
    "",
    '```javascript',
    'window.__profileBioExecuted = true;',
    '```',
    "",
    '**Still readable**'
  ].join("\n") };
  const externalRequests: string[] = [];
  await page.route("https://untrusted.example/**", async (route) => {
    externalRequests.push(route.request().url());
    await route.abort();
  });
  await page.goto(`/validators/${OPERATOR}`);
  const bio = page.locator(".profile-bio");
  await expect(bio.locator("strong")).toHaveText("Still readable");
  for (const [label] of unsafeLinks) await expect(bio.getByText(label, { exact: true })).toBeVisible();
  await expect(bio.getByText("Blocked image", { exact: true })).toBeVisible();
  await expect(bio.getByText("Email image", { exact: true })).toBeVisible();
  await expect(bio.locator("a, img, script, iframe, object, embed, style, link, form, input, button, svg, math")).toHaveCount(0);
  await expect(bio.locator("pre code")).toHaveText("window.__profileBioExecuted = true;");
  expect(await bio.evaluate((element) => Array.from(element.querySelectorAll("*")).some((node) =>
    Array.from(node.attributes).some((attribute) => /^on/i.test(attribute.name))
  ))).toBe(false);
  expect(await page.evaluate(() => Reflect.get(window, "__profileBioExecuted"))).toBeUndefined();
  expect(externalRequests).toEqual([]);
});

test("uses profile names and avatars on the validator list without changing validator links or stake", async ({ page, profileApi }) => {
  await page.goto("/validators");
  const row = page.locator(`a[href="/validators/${OPERATOR}"]`);
  await expect(row.getByText("Apollo Community", { exact: true })).toBeVisible();
  await expect(row.getByRole("img", { name: "Apollo Community avatar" })).toHaveAttribute("src", PROFILE.pictures.profile);
  await expect(row.getByText("12,345 DSM", { exact: true })).toBeVisible();
  expect(profileApi.requests.filter((path) => path === `/desmos/profiles/v3/profiles/${ACCOUNT}`)).toHaveLength(1);
  expect(profileApi.requests).not.toContain(`/cosmos/staking/v1beta1/validators/${OPERATOR}`);
  await row.click();
  await expect(page.getByRole("heading", { name: "Apollo Community", exact: true })).toBeVisible();
});

for (const view of ["wallet", "account"] as const) {
  test(`updates ${view} delegation identities without waiting for profiles to load`, async ({ page, profileApi }, testInfo) => {
    let releaseProfile!: () => void;
    profileApi.profileReady = new Promise<void>((resolve) => { releaseProfile = resolve; });
    if (view === "wallet") {
      await page.addInitScript((address) => {
        window.keplr = { enable: async () => {}, getKey: async () => { throw new Error("Unused"); } };
        window.getOfflineSigner = () => ({
          getAccounts: async () => [{ address, algo: "secp256k1", pubkey: new Uint8Array(33) }],
          signDirect: async () => { throw new Error("This test must not sign transactions."); }
        });
      }, ACCOUNT);
    }
    try {
      await page.goto(view === "wallet" ? "/wallet" : `/accounts/${ACCOUNT}`);
      if (view === "wallet") {
        await page.getByRole("button", { name: /^Keplr/ }).click();
        await expect(page.getByText("Available: 100.000000 DSM", { exact: true })).toBeVisible();
        await expect(page.getByText("Total rewards: 1.000000 DSM", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Claim rewards", exact: true })).toBeEnabled();
      }
      await expect(page.getByText("Staking name", { exact: true })).toHaveCount(3);
      // An unbonded validator can still have a profile even without a directory entry.
      await expect(page.getByText("Inactive Community", { exact: true })).toBeVisible();
      releaseProfile();
      await expect(page.getByText("Apollo Community", { exact: true })).toHaveCount(3);
      const avatars = page.getByRole("img", { name: "Apollo Community avatar", exact: true });
      await expect(avatars).toHaveCount(3);
      for (const avatar of await avatars.all()) await expect(avatar).toHaveAttribute("src", PROFILE.pictures.profile);
      await expect(page.getByRole("img", { name: "Inactive Community avatar" })).toHaveAttribute("src", PROFILE.pictures.profile);
      expect(profileApi.requests.filter((path) => path === `/desmos/profiles/v3/profiles/${ACCOUNT}`)).toHaveLength(1);
      expect(profileApi.requests.filter((path) => path === `/desmos/profiles/v3/profiles/${INACTIVE_ACCOUNT}`)).toHaveLength(1);
      expect(profileApi.requests).not.toContain(`/cosmos/staking/v1beta1/validators/${INACTIVE_OPERATOR}`);
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${view}-profile-identities.png`), fullPage: true });
    } finally {
      releaseProfile();
    }
  });
}

test("renders profile names as text and rejects unsafe list avatar URLs", async ({ page, profileApi }) => {
  const nickname = '<img src="x" onerror="alert(1)">';
  profileApi.profile = { ...PROFILE, nickname, pictures: { profile: "javascript:alert(1)" } };
  await page.goto("/validators");
  const row = page.locator(`a[href="/validators/${OPERATOR}"]`);
  await expect(row.getByText(nickname, { exact: true })).toBeVisible();
  await expect(row.getByRole("img")).toHaveCount(1);
  await expect(row.getByRole("img")).toHaveAttribute("src", `/api/keybase/avatar/${IDENTITY}`);
  await expect(row.locator("[onerror], script, iframe")).toHaveCount(0);
});

test("resolves proposer consensus addresses to profile accounts on block lists and details", async ({ page, profileApi }) => {
  let releaseProfile!: () => void;
  profileApi.profileReady = new Promise<void>((resolve) => { releaseProfile = resolve; });
  try {
    const blockResponse = page.waitForResponse((response) => response.url().endsWith("/api/blocks?limit=20"));
    await page.goto("/blocks");
    const blocks = await (await blockResponse).json();
    expect(blocks[0].proposerAddress).toBe(CONSENSUS.toLowerCase());
    expect(blocks[0].proposerOperatorAddress).toBe(OPERATOR);
    expect(blocks[2].proposerAddress).toBe(UNKNOWN_CONSENSUS);
    expect(blocks[2].proposerOperatorAddress).toBe("");
    await expect(page.getByRole("row")).toHaveCount(4);
    await expect(page.getByText("Staking name", { exact: true })).toHaveCount(2);
    releaseProfile();
    await expect(page.getByText("Apollo Community", { exact: true })).toHaveCount(2);
    for (const avatar of await page.getByRole("img", { name: "Apollo Community avatar" }).all()) {
      await expect(avatar).toHaveAttribute("src", PROFILE.pictures.profile);
    }
    await expect(page.getByRole("row").last().getByRole("img")).toHaveAttribute("src", /^data:image\/svg\+xml/);
    expect(profileApi.requests.filter((path) => path.startsWith("/desmos/profiles/"))).toEqual([
      `/desmos/profiles/v3/profiles/${ACCOUNT}`
    ]);
    await page.getByRole("link", { name: "3", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Block 3", exact: true })).toBeVisible();
    await expect(page.getByText("Apollo Community", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Signed Validators (1)" })).toBeVisible();
    await expect(page.locator(`a[href="/validators/${OPERATOR}"]`).getByRole("img")).toHaveAttribute("src", PROFILE.pictures.profile);
    expect(profileApi.requests.filter((path) => path.startsWith("/desmos/profiles/"))).toHaveLength(1);
  } finally {
    releaseProfile();
  }
});

test("keeps block proposers visible when Desmos Profiles are unavailable", async ({ page, profileApi }) => {
  profileApi.status = 503;
  const profileResponse = page.waitForResponse((response) => response.url().endsWith(`/validators/${OPERATOR}/profile`));
  await page.goto("/blocks");
  expect(await (await profileResponse).json()).toBeNull();
  await expect(page.getByRole("row")).toHaveCount(4);
  await expect(page.getByText("Staking name", { exact: true })).toHaveCount(2);
  for (const avatar of await page.getByRole("img", { name: "Staking name avatar" }).all()) {
    await expect(avatar).toHaveAttribute("src", `/api/keybase/avatar/${IDENTITY}`);
  }
  await expect(page.getByRole("row").last().getByRole("img")).toHaveAttribute("src", /^data:image\/svg\+xml/);
});
