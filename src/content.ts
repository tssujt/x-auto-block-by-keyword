interface Settings {
  keywords: string[];
  autoBlock: boolean;
}

interface ReplyMatch {
  replyId: string;
  handle: string;
  matchedKeyword: string;
}

interface QueueItem extends ReplyMatch {
  article: Element;
}

interface State {
  settings: Settings;
  queue: QueueItem[];
  queueBusy: boolean;
  matchedReplyIds: Set<string>;
  blockedReplyIds: Set<string>;
  observer: MutationObserver | null;
  listenersBound: boolean;
  currentPathname: string;
  disposed: boolean;
}

const STATE: State = {
  settings: { keywords: [], autoBlock: false },
  queue: [],
  queueBusy: false,
  matchedReplyIds: new Set<string>(),
  blockedReplyIds: new Set<string>(),
  observer: null,
  listenersBound: false,
  currentPathname: window.location.pathname,
  disposed: false
};

const STYLE_ID = "x-keyword-blocker-style";
const QUICK_ADD_PANEL_ID = "xkb-quick-add-panel";
const QUICK_ADD_INPUT_ID = "xkb-quick-add-input";
const QUICK_ADD_BUTTON_ID = "xkb-quick-add-button";
const QUICK_ADD_META_ID = "xkb-quick-add-meta";
const ARTICLE_SELECTOR = 'article[data-testid="tweet"]';
const TIMELINE_SELECTORS = [
  'div[data-testid="primaryColumn"]',
  '[aria-label*="Conversation"]'
];

let mutationDebounceId: number | undefined;
let routeIntervalId: number | undefined;

void boot().catch((error) => reportContentScriptError("x-auto-block-by-keyword init failed", error));

async function boot(): Promise<void> {
  watchRouteChanges();
  await initForCurrentPage();
}

async function initForCurrentPage(): Promise<void> {
  if (!isStatusPage()) {
    STATE.observer?.disconnect();
    clearFlags();
    removeQuickAddPanel();
    return;
  }

  injectStyles();
  await refreshSettings();
  bindListeners();
  ensureQuickAddPanel();
  renderQuickAddPanelMeta();
  observeTimeline();
  await scanReplies();
}

function isStatusPage(): boolean {
  return /\/status\/\d+/.test(window.location.pathname);
}

function watchRouteChanges(): void {
  routeIntervalId = window.setInterval(() => {
    if (STATE.disposed) {
      return;
    }

    if (STATE.currentPathname === window.location.pathname) {
      return;
    }

    STATE.currentPathname = window.location.pathname;
    STATE.queue = [];
    STATE.queueBusy = false;
    STATE.matchedReplyIds.clear();
    void initForCurrentPage().catch((error) => reportContentScriptError("route change init failed", error));
  }, 600);
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .xkb-flag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(177, 66, 27, 0.12);
      color: rgb(177, 66, 27);
      font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .xkb-flag button {
      border: 0;
      border-radius: 999px;
      padding: 4px 8px;
      cursor: pointer;
      font: inherit;
      color: white;
      background: rgb(177, 66, 27);
    }

    .xkb-quick-add {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483647;
      width: min(320px, calc(100vw - 32px));
      padding: 14px;
      border: 1px solid rgba(207, 184, 162, 0.95);
      border-radius: 18px;
      background:
        linear-gradient(180deg, rgba(255, 252, 245, 0.98), rgba(246, 237, 225, 0.98));
      box-shadow: 0 18px 40px rgba(29, 27, 24, 0.18);
      color: rgb(29, 27, 24);
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      backdrop-filter: blur(14px);
    }

    .xkb-quick-add__eyebrow {
      margin: 0 0 4px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgb(106, 98, 88);
    }

    .xkb-quick-add__title {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 700;
    }

    .xkb-quick-add__row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .xkb-quick-add__input {
      flex: 1;
      min-width: 0;
      border: 1px solid rgba(207, 184, 162, 1);
      border-radius: 999px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.94);
      color: inherit;
      font: inherit;
    }

    .xkb-quick-add__input:focus {
      outline: 2px solid rgba(177, 66, 27, 0.28);
      outline-offset: 1px;
    }

    .xkb-quick-add__submit {
      border: 0;
      border-radius: 999px;
      padding: 10px 14px;
      cursor: pointer;
      background: rgb(177, 66, 27);
      color: white;
      font: 700 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .xkb-quick-add__meta {
      margin-top: 9px;
      min-height: 18px;
      color: rgb(106, 98, 88);
      font-size: 12px;
    }
  `;

  document.head.appendChild(style);
}

async function refreshSettings(): Promise<void> {
  STATE.settings = normalizeSettings(
    await chrome.storage.sync.get({
      keywords: [],
      autoBlock: false
    })
  );
}

function bindListeners(): void {
  if (STATE.listenersBound) {
    return;
  }

  STATE.listenersBound = true;

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    const next = {
      ...STATE.settings,
      ...(changes.keywords ? { keywords: changes.keywords.newValue } : {}),
      ...(changes.autoBlock ? { autoBlock: changes.autoBlock.newValue } : {})
    };

    STATE.settings = normalizeSettings(next);
    renderQuickAddPanelMeta();
    void scanReplies().catch((error) =>
      reportContentScriptError("scan after settings change failed", error)
    );
  });

  chrome.runtime.onMessage.addListener((
    message: { type?: string },
    _sender,
    sendResponse: (response: { ok: boolean; matchedCount?: number; error?: string }) => void
  ) => {
    if (message?.type !== "scan-now") {
      return false;
    }

    void scanReplies()
      .then((matchedCount) => sendResponse({ ok: true, matchedCount }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );

    return true;
  });
}

function observeTimeline(): void {
  STATE.observer?.disconnect();

  STATE.observer = new MutationObserver(() => {
    if (!STATE.settings.keywords.length) {
      return;
    }

    if (mutationDebounceId !== undefined) {
      window.clearTimeout(mutationDebounceId);
    }

    mutationDebounceId = window.setTimeout(() => {
      void scanReplies().catch((error) => reportContentScriptError("mutation scan failed", error));
    }, 300);
  });

  STATE.observer.observe(document.body, { childList: true, subtree: true });
}

function ensureQuickAddPanel(): void {
  if (document.getElementById(QUICK_ADD_PANEL_ID)) {
    return;
  }

  const panel = document.createElement("section");
  panel.id = QUICK_ADD_PANEL_ID;
  panel.className = "xkb-quick-add";
  panel.innerHTML = `
    <p class="xkb-quick-add__eyebrow">Keyword tools</p>
    <p class="xkb-quick-add__title">Quick add filter</p>
    <div class="xkb-quick-add__row">
      <input
        id="${QUICK_ADD_INPUT_ID}"
        class="xkb-quick-add__input"
        type="text"
        placeholder="spam, bot, promo"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      >
      <button id="${QUICK_ADD_BUTTON_ID}" class="xkb-quick-add__submit" type="button">Add</button>
    </div>
    <div id="${QUICK_ADD_META_ID}" class="xkb-quick-add__meta"></div>
  `;

  document.body.appendChild(panel);

  const input = document.getElementById(QUICK_ADD_INPUT_ID) as HTMLInputElement | null;
  const button = document.getElementById(QUICK_ADD_BUTTON_ID) as HTMLButtonElement | null;

  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void addKeywordsFromPageInput();
  });

  button?.addEventListener("click", () => {
    void addKeywordsFromPageInput();
  });
}

function removeQuickAddPanel(): void {
  document.getElementById(QUICK_ADD_PANEL_ID)?.remove();
}

function renderQuickAddPanelMeta(message?: string): void {
  const meta = document.getElementById(QUICK_ADD_META_ID);
  if (!meta) {
    return;
  }

  meta.textContent = message ?? `${STATE.settings.keywords.length} keywords active on this page.`;
}

async function addKeywordsFromPageInput(): Promise<void> {
  const input = document.getElementById(QUICK_ADD_INPUT_ID) as HTMLInputElement | null;
  if (!input) {
    return;
  }

  const additions = parseKeywords(input.value);
  if (!additions.length) {
    renderQuickAddPanelMeta("Type at least one keyword to add.");
    return;
  }

  const mergedKeywords = mergeKeywords(STATE.settings.keywords, additions);
  const addedCount = mergedKeywords.length - STATE.settings.keywords.length;

  if (addedCount === 0) {
    renderQuickAddPanelMeta("Those keywords are already saved.");
    input.select();
    return;
  }

  await chrome.storage.sync.set({ keywords: mergedKeywords });
  input.value = "";
  renderQuickAddPanelMeta(`Added ${addedCount} keyword${addedCount === 1 ? "" : "s"}.`);
}

async function scanReplies(): Promise<number> {
  if (!isStatusPage()) {
    return 0;
  }

  clearFlags();
  STATE.matchedReplyIds.clear();

  const timeline = TIMELINE_SELECTORS
    .map((selector) => document.querySelector(selector))
    .find((node): node is Element => node !== null) ?? document.body;
  const articles = Array.from(timeline.querySelectorAll(ARTICLE_SELECTOR));
  const replyArticles = articles.slice(1);
  let matchedCount = 0;

  for (const article of replyArticles) {
    const result = inspectReply(article);
    if (!result) {
      continue;
    }

    matchedCount += 1;
    markReply(article, result);

    if (STATE.settings.autoBlock) {
      enqueueBlock(article, result);
    }
  }

  await runQueue();
  return matchedCount;
}

function inspectReply(article: Element): ReplyMatch | null {
  const textNode = article.querySelector('[data-testid="tweetText"]');
  const replyId = article.querySelector('a[href*="/status/"]')?.getAttribute("href") ?? "";
  if (!textNode || !replyId) {
    return null;
  }

  const matchedKeyword = matchKeyword(textNode.textContent, STATE.settings.keywords);
  if (!matchedKeyword) {
    return null;
  }

  const handleAnchor = Array.from(article.querySelectorAll('a[href^="/"]')).find((anchor) =>
    /^\/[A-Za-z0-9_]+$/.test(anchor.getAttribute("href") ?? "")
  );

  return {
    replyId,
    handle: handleAnchor?.getAttribute("href")?.slice(1) ?? "unknown",
    matchedKeyword
  };
}

function markReply(article: Element, result: ReplyMatch): void {
  if (STATE.matchedReplyIds.has(result.replyId)) {
    return;
  }

  STATE.matchedReplyIds.add(result.replyId);
  const footer = article.querySelector('[role="group"]') ?? article;
  const flag = document.createElement("div");
  flag.className = "xkb-flag";
  flag.dataset.replyId = result.replyId;
  flag.innerHTML = `
    <span>Matched "${escapeHtml(result.matchedKeyword)}" from @${escapeHtml(result.handle)}</span>
    <button type="button">Block user</button>
  `;

  flag.querySelector("button")?.addEventListener("click", () => {
    enqueueBlock(article, result);
    void runQueue().catch((error) => console.error("manual block failed", error));
  });

  footer.parentElement?.appendChild(flag);
}

function enqueueBlock(article: Element, result: ReplyMatch): void {
  if (STATE.blockedReplyIds.has(result.replyId)) {
    return;
  }

  const alreadyQueued = STATE.queue.some((item) => item.replyId === result.replyId);
  if (alreadyQueued) {
    return;
  }

  STATE.queue.push({ article, ...result });
}

function clearFlags(): void {
  document.querySelectorAll(".xkb-flag").forEach((node) => node.remove());
}

async function runQueue(): Promise<void> {
  if (STATE.queueBusy) {
    return;
  }

  STATE.queueBusy = true;

  try {
    while (STATE.queue.length) {
      const next = STATE.queue.shift();
      if (!next || STATE.blockedReplyIds.has(next.replyId)) {
        continue;
      }

      const blocked = await blockReplyAuthor(next.article, next.handle);
      if (blocked) {
        STATE.blockedReplyIds.add(next.replyId);
      }

      await wait(400);
    }
  } finally {
    STATE.queueBusy = false;
  }
}

async function blockReplyAuthor(article: Element, handle: string): Promise<boolean> {
  const menuButton = findMenuButton(article);
  if (!menuButton) {
    console.warn("No menu button found for reply", handle);
    return false;
  }

  menuButton.click();

  const blockMenuItem = await waitForElement(
    '[role="menuitem"][data-testid="block"], [role="menuitem"]'
  );
  if (!blockMenuItem) {
    console.warn("No block menu item found for reply", handle);
    return false;
  }

  const blockLabel = blockMenuItem.textContent?.toLowerCase() ?? "";
  if (!blockLabel.includes("block")) {
    const fallback = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.toLowerCase().includes("block")
    );
    if (!fallback) {
      return false;
    }

    fallback.click();
  } else {
    blockMenuItem.click();
  }

  const confirmButton = await waitForElement(
    '[data-testid="confirmationSheetConfirm"], [data-testid="confirmationSheetPrimaryAction"]'
  );
  if (!confirmButton) {
    console.warn("No block confirmation button found for reply", handle);
    return false;
  }

  confirmButton.click();
  return true;
}

function findMenuButton(article: Element): HTMLElement | null {
  const exactMatch = article.querySelector<HTMLElement>(
    'button[data-testid="caret"][aria-label="More"][aria-haspopup="menu"]'
  );
  if (exactMatch) {
    return exactMatch;
  }

  const userName = article.querySelector('[data-testid="User-Name"]');
  const headerScope = userName?.parentElement?.parentElement?.parentElement ?? article;
  const scopedFallback = headerScope.querySelector<HTMLElement>(
    'button[data-testid="caret"], button[aria-label="More"], button[aria-label*="More"]'
  );
  if (scopedFallback) {
    return scopedFallback;
  }

  return article.querySelector<HTMLElement>(
    'button[data-testid="caret"], button[aria-label="More"], button[aria-label*="More"]'
  );
}

function waitForElement(selector: string, timeoutMs = 3000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLElement>(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const candidate = document.querySelector<HTMLElement>(selector);
      if (candidate) {
        observer.disconnect();
        resolve(candidate);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

function reportContentScriptError(context: string, error: unknown): void {
  if (isExtensionContextInvalidated(error)) {
    disposeContentScript();
    return;
  }

  console.error(context, error);
}

function isExtensionContextInvalidated(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("Extension context invalidated");
}

function disposeContentScript(): void {
  if (STATE.disposed) {
    return;
  }

  STATE.disposed = true;
  STATE.queue = [];
  STATE.queueBusy = false;
  STATE.observer?.disconnect();
  STATE.observer = null;
  removeQuickAddPanel();
  clearFlags();

  if (mutationDebounceId !== undefined) {
    window.clearTimeout(mutationDebounceId);
    mutationDebounceId = undefined;
  }

  if (routeIntervalId !== undefined) {
    window.clearInterval(routeIntervalId);
    routeIntervalId = undefined;
  }
}

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char] ?? char));
}

function normalizeKeyword(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseKeywords(input: unknown): string[] {
  const parts = Array.isArray(input)
    ? input
    : String(input ?? "").split(/[\n,]+/);

  return [...new Set(parts.map(normalizeKeyword).filter(Boolean))];
}

function compactKeywords(input: unknown): string[] {
  const keywords = parseKeywords(input);

  return keywords.filter((keyword) => !keywords.some((otherKeyword) =>
    otherKeyword !== keyword
    && otherKeyword.length < keyword.length
    && keyword.includes(otherKeyword)
  ));
}

function mergeKeywords(existing: unknown, additions: unknown): string[] {
  return compactKeywords([...parseKeywords(existing), ...parseKeywords(additions)]);
}

function normalizeSettings(raw: Partial<Settings> | Record<string, unknown> = {}): Settings {
  return {
    keywords: compactKeywords(raw.keywords ?? []),
    autoBlock: Boolean(raw.autoBlock)
  };
}

function matchKeyword(text: unknown, keywords: string[]): string | null {
  const normalizedText = normalizeKeyword(text);
  if (!normalizedText) {
    return null;
  }

  return keywords.find((keyword) => normalizedText.includes(keyword)) ?? null;
}
