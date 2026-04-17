import { normalizeSettings } from "./lib/keywords.js";

const keywordInput = document.querySelector<HTMLTextAreaElement>("#keywordInput");
const autoBlock = document.querySelector<HTMLInputElement>("#autoBlock");
const saveButton = document.querySelector<HTMLButtonElement>("#saveButton");
const saveStatus = document.querySelector<HTMLSpanElement>("#saveStatus");

function requireElement<T extends Element>(element: T | null, selector: string): T {
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

const keywordInputNode = requireElement(keywordInput, "#keywordInput");
const autoBlockInput = requireElement(autoBlock, "#autoBlock");
const saveButtonNode = requireElement(saveButton, "#saveButton");
const saveStatusNode = requireElement(saveStatus, "#saveStatus");

async function loadSettings(): Promise<void> {
  const settings = normalizeSettings(await chrome.storage.sync.get({
    keywords: [],
    autoBlock: false
  }));
  keywordInputNode.value = settings.keywords.join("\n");
  autoBlockInput.checked = settings.autoBlock;
}

async function saveSettings(): Promise<void> {
  const settings = normalizeSettings({
    keywords: keywordInputNode.value,
    autoBlock: autoBlockInput.checked
  });

  await chrome.storage.sync.set({
    keywords: settings.keywords,
    autoBlock: settings.autoBlock
  });

  keywordInputNode.value = settings.keywords.join("\n");

  saveStatusNode.textContent = "Saved.";
  window.setTimeout(() => {
    saveStatusNode.textContent = "";
  }, 1500);
}

saveButtonNode.addEventListener("click", () => {
  void saveSettings();
});

void loadSettings();
