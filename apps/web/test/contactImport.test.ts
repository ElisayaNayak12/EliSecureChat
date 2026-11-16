import { test } from "node:test";
import assert from "node:assert/strict";
import { parseContactsFile } from "../src/features/contactImport";

test("reads phone numbers and emails from a vCard export (Google Contacts / iPhone)", () => {
  const vcf = [
    "BEGIN:VCARD", "VERSION:3.0", "FN:Asha Rao", "TEL;TYPE=CELL:+91 91111 00001", "EMAIL;TYPE=INTERNET:Asha@Gmail.com", "END:VCARD",
    "BEGIN:VCARD", "VERSION:3.0", "FN:Ravi", "item1.TEL:091111-00002", "NOTE:call me on 12", "END:VCARD",
  ].join("\r\n");
  assert.deepEqual(parseContactsFile(vcf).sort(), ["+919111100001", "09111100002", "asha@gmail.com"].sort());
});

test("reads a CSV export and ignores short numbers", () => {
  const csv = "Name,Phone,Email\nAsha,+91 91111 00001,asha@gmail.com\nShop,1234,\nRavi,(911) 110-0002,";
  const got = parseContactsFile(csv);
  assert.ok(got.includes("+919111100001"));
  assert.ok(got.includes("asha@gmail.com"));
  assert.ok(got.includes("9111100002"));
  assert.ok(!got.includes("1234"));
});
