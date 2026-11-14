/*
 * Every relative link in a document an agent is told to read must point at a
 * file that exists. A link to a guide nobody wrote sends a model looking for
 * instructions that are not there, and a smaller model tends to invent them.
 * Web links and in-page anchors are not checked.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));

const FILES = ["README.md", "PROJECT.md", "AGENTS.md", "CONTRIBUTING.md", "GLOSSARY.md", ".github/copilot-instructions.md"];
const DIRS = [
  "docs/runbooks", "docs/architecture", "docs/decisions", "docs/agents", "docs/codebase", "docs/threat-models",
  ".github/agents", ".github/instructions", ".github/prompts", ".github/skills/device-references",
];
const ALSO = ["docs/templates/wallet-task.md", "docs/templates/project-brief.md"];

/** Markdown files under `dir`, relative to the repository root. */
function markdownUnder(dir) {
  const found = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...markdownUnder(rel));
    else if (entry.name.endsWith(".md")) found.push(rel);
  }
  return found;
}

/** Relative link targets in Markdown text, without code blocks, web links or pure anchors. */
export function relativeLinks(text) {
  const prose = text.replace(/```[\s\S]*?```/g, "");
  const targets = [];
  for (const match of prose.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].split("#")[0];
    if (target && !/^[a-z][a-z0-9+.-]*:/i.test(target)) targets.push(target);
  }
  return targets;
}

test("the link reader finds relative targets and skips web links, anchors and code", () => {
  const text = "[a](docs/x.md#part) [b](https://example.test/y) [c](#here) ![img](pic.png)\n```\n[d](not/checked.md)\n```\n[e](../up.md \"title\")";
  assert.deepEqual(relativeLinks(text), ["docs/x.md", "../up.md"]);
});

test("every relative link in the documents agents read points at an existing file", () => {
  const skills = fs.readdirSync(path.join(root, ".github/skills"))
    .map((name) => `.github/skills/${name}/SKILL.md`)
    .filter((file) => fs.existsSync(path.join(root, file)));
  const files = [...new Set([...FILES, ...DIRS.flatMap(markdownUnder), ...ALSO, ...skills])];
  assert.ok(files.length > 60, "the document list is not empty by accident");
  const broken = [];
  for (const file of files) {
    for (const target of relativeLinks(fs.readFileSync(path.join(root, file), "utf8"))) {
      if (!fs.existsSync(path.join(root, path.dirname(file), target))) broken.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});
