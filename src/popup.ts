import { normalizeSettings, summarizeKeywords } from "./lib/keywords.js";

interface ScanResponse {
  ok: boolean;
  matchedCount?: number;
  error?: string;
}

interface ScanNowMessage {
  type: "scan-now";
}

const keywordSummary = document.querySelector<HTMLDivElement>("#keywordSummary");
const autoBlock = document.querySelector<HTMLInputElement>("#autoBlock");
const scanButton = document.querySelector<HTMLButtonElement>("#scanButton");
const optionsButton = document.querySelector<HTMLButtonElement>("#optionsButton");
const statusText = document.querySelector<HTMLDivElement>("#statusText");

function requireElement<T extends Element>(element: T | null, selector: string): T {
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

const summaryNode = requireElement(keywordSummary, "#keywordSummary");
const autoBlockInput = requireElement(autoBlock, "#autoBlock");
const scanButtonNode = requireElement(scanButton, "#scanButton");
const optionsButtonNode = requireElement(optionsButton, "#optionsButton");
const statusNode = requireElement(statusText, "#statusText");

async function loadSettings(): Promise<void> {
  const settings = normalizeSettings(await chrome.storage.sync.get({
    keywords: [],
    autoBlock: false
  }));

  summaryNode.textContent = settings.keywords.length
    ? summarizeKeywords(settings.keywords)
    : "No keywords configured";
  autoBlockInput.checked = settings.autoBlock;
}

async function saveAutoBlock(): Promise<void> {
  await chrome.storage.sync.set({ autoBlock: autoBlockInput.checked });
  statusNode.textContent = autoBlockInput.checked
    ? "Auto-block enabled."
    : "Auto-block disabled.";
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function scanCurrentTab(): Promise<void> {
  const tabId = await getActiveTabId();
  if (!tabId) {
    statusNode.textContent = "No active X tab found.";
    return;
  }

  statusNode.textContent = "Scanning current tweet...";

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isSupportedUrl(tab.url)) {
      statusNode.textContent = "Open a tweet page on x.com or twitter.com first.";
      return;
    }

    let response: ScanResponse;

    try {
      response = await sendScanMessage(tabId);
    } catch (error) {
      if (!isMissingReceiverError(error)) {
        throw error;
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });

      response = await sendScanMessage(tabId);
    }

    if (!response.ok) {
      statusNode.textContent = response.error ?? "Scan failed.";
      return;
    }

    statusNode.textContent = `Matched ${response.matchedCount ?? 0} replies.`;
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : String(error);
  }
}

function sendScanMessage(tabId: number): Promise<ScanResponse> {
  return chrome.tabs.sendMessage<ScanNowMessage, ScanResponse>(tabId, { type: "scan-now" });
}

function isSupportedUrl(url?: string): boolean {
  if (!url) {
    return false;
  }

  return /^https:\/\/(x|twitter)\.com\/.+\/status\/\d+/.test(url);
}

function isMissingReceiverError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("Receiving end does not exist");
}

autoBlockInput.addEventListener("change", () => {
  void saveAutoBlock();
});

scanButtonNode.addEventListener("click", () => {
  void scanCurrentTab();
});

optionsButtonNode.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

void loadSettings();
