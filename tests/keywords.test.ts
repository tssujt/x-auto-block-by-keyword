import test from "node:test";
import assert from "node:assert/strict";

import {
  compactKeywords,
  matchKeyword,
  mergeKeywords,
  normalizeSettings,
  parseKeywords,
  summarizeKeywords
} from "../src/lib/keywords.js";

test("parseKeywords trims, lowercases, and deduplicates", () => {
  assert.deepEqual(parseKeywords(" Spam,\nBOT,\nspam "), ["spam", "bot"]);
});

test("compactKeywords drops longer keywords covered by shorter ones", () => {
  assert.deepEqual(compactKeywords(["promo code", "promo", "bot farm", "bot"]), ["promo", "bot"]);
});

test("matchKeyword returns the first keyword match", () => {
  assert.equal(matchKeyword("This has a promo code inside", ["bot", "promo"]), "promo");
});

test("normalizeSettings applies defaults", () => {
  assert.deepEqual(normalizeSettings({ autoBlock: 1 }), {
    keywords: [],
    autoBlock: true
  });
});

test("normalizeSettings compacts overlapping keywords", () => {
  assert.deepEqual(normalizeSettings({ keywords: ["promo code", "promo"], autoBlock: false }), {
    keywords: ["promo"],
    autoBlock: false
  });
});

test("summarizeKeywords returns a stable summary string", () => {
  assert.equal(summarizeKeywords(["Spam", "bot"]), "spam, bot");
});

test("mergeKeywords appends new values without duplicates", () => {
  assert.deepEqual(mergeKeywords(["spam", "bot"], "Bot, promo"), ["spam", "bot", "promo"]);
});

test("mergeKeywords removes longer keywords when a shorter one covers them", () => {
  assert.deepEqual(mergeKeywords(["promo code"], "promo"), ["promo"]);
});
