import assert from "node:assert/strict";
import test from "node:test";
import { formatFinMessage } from "../utils/fin-message-format.ts";

const blockText = (block: ReturnType<typeof formatFinMessage>[number]) => block.spans.map(span => span.text).join("");

test("Fin headings and bold amounts become presentation rather than visible Markdown", () => {
  const blocks = formatFinMessage("### **Your savings plan**\n\nSave **RM400.50** each month.");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, "heading");
  assert.equal(blockText(blocks[0]), "Your savings plan");
  assert.deepEqual(blocks[1].spans, [
    { text: "Save ", emphasis: false }, { text: "RM400.50", emphasis: true }, { text: " each month.", emphasis: false },
  ]);
});

test("bullet and numbered steps retain their text, amounts and original numbering", () => {
  const blocks = formatFinMessage("- **Food:** RM500\n* Transport: RM120.25\n3. Keep RM1000 aside\n4) Check bills first");
  assert.deepEqual(blocks.map(block => block.kind), ["bullet", "bullet", "numbered", "numbered"]);
  assert.deepEqual(blocks.map(blockText), ["Food: RM500", "Transport: RM120.25", "Keep RM1000 aside", "Check bills first"]);
  assert.deepEqual(blocks.slice(2).map(block => block.number), ["3", "4"]);
});

test("negative amounts, arithmetic, merchant hashes and years are not eaten as formatting", () => {
  const text = "Your balance: -RM50.25\n- RM50.25\n- 50.25\nRM5 * 2\nShop #1\n2026. Spending review";
  const blocks = formatFinMessage(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, "paragraph");
  assert.equal(blockText(blocks[0]), text);
});

test("paragraph spacing is normalised while deliberate line breaks and finance facts survive", () => {
  const blocks = formatFinMessage("  Income: RM4000\r\nBills: RM2200\r\n\r\n\r\nYour remaining cash is **RM1800**.  ");
  assert.equal(blocks.length, 2);
  assert.equal(blockText(blocks[0]), "Income: RM4000\nBills: RM2200");
  assert.equal(blockText(blocks[1]), "Your remaining cash is RM1800.");
});

test("multiple emphasis spans and non-English text keep their original content", () => {
  const blocks = formatFinMessage("Simpan __RM400__ sebulan; sasaran **RM5000**.\n\n每月存 **RM400**，不含利息。");
  assert.equal(blockText(blocks[0]), "Simpan RM400 sebulan; sasaran RM5000.");
  assert.equal(blockText(blocks[1]), "每月存 RM400，不含利息。");
  assert.equal(blocks[0].spans.filter(span => span.emphasis).length, 2);
});

test("plain answers and empty replies do not gain fake headings or list items", () => {
  assert.deepEqual(formatFinMessage("\n \n"), []);
  const blocks = formatFinMessage("Check the amounts before deciding.");
  assert.deepEqual(blocks, [{ kind: "paragraph", spans: [{ text: "Check the amounts before deciding.", emphasis: false }] }]);
});
