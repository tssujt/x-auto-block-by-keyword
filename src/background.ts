import { DEFAULT_SETTINGS, normalizeSettings } from "./lib/keywords.js";

interface ScanRequestMessage {
  type: "run-scan";
  tabId?: number;
}

interface ScanNowMessage {
  type: "scan-now";
}

interface ScanResponse {
  ok: boolean;
  matchedCount?: number;
  error?: string;
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = normalizeSettings(await chrome.storage.sync.get({
    keywords: [],
    autoBlock: false
  }));

  await chrome.storage.sync.set({
    keywords: current.keywords.length ? current.keywords : DEFAULT_SETTINGS.keywords,
    autoBlock: current.autoBlock
  });
});

chrome.runtime.onMessage.addListener((
  message: ScanRequestMessage,
  sender,
  sendResponse: (response: ScanResponse) => void
) => {
  if (message?.type !== "run-scan") {
    return false;
  }

  void runScan(message, sender, sendResponse);
  return true;
});

async function runScan(
  message: ScanRequestMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ScanResponse) => void
): Promise<void> {
  try {
    const tabId = await resolveTabId(message, sender);
    if (!tabId) {
      sendResponse({ ok: false, error: "No active X tab found." });
      return;
    }

    const tab = await chrome.tabs.get(tabId);
    if (!isSupportedUrl(tab.url)) {
      sendResponse({ ok: false, error: "Open a tweet page on x.com or twitter.com first." });
      return;
    }

    try {
      const response = await sendScanMessage(tabId);
      sendResponse(response);
      return;
    } catch (error) {
      if (!isMissingReceiverError(error)) {
        throw error;
      }
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });

    const response = await sendScanMessage(tabId);
    sendResponse(response);
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function resolveTabId(
  message: ScanRequestMessage,
  sender: chrome.runtime.MessageSender
): Promise<number | null> {
  if (typeof message.tabId === "number") {
    return message.tabId;
  }

  if (sender.tab?.id) {
    return sender.tab.id;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab?.id ?? null;
}

function sendScanMessage(tabId: number): Promise<ScanResponse> {
  return chrome.tabs.sendMessage<ScanNowMessage, ScanResponse>(tabId, { type: "scan-now" });
}

function isSupportedUrl(url?: string): boolean {
  if (!url) {
    return false;
  }

  return /^https:\/\/(x|twitter)\.com\/.+/.test(url);
}

function isMissingReceiverError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("Receiving end does not exist");
}
