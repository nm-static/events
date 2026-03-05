#!/usr/bin/env node

/**
 * Obsidian → Astro Parser
 *
 * Reads event markdown files from the Obsidian vault and generates
 * Astro-compatible content collection files.
 *
 * Usage:
 *   node parse.mjs [--repo <org/repo>] [--subdir <path>] [--vault <path>] [--out <path>] [--dry-run]
 *
 * Defaults:
 *   --repo   nm-obsidian/service    (GitHub repo to clone/pull)
 *   --subdir events                 (subdirectory within repo)
 *   --vault  (auto: .vault-cache/events)  (override to skip cloning)
 *   --out    ./src/content/events
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ──
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const dryRun = args.includes("--dry-run");

const REPO = flag("repo", "nm-obsidian/service");
const REPO_SUBDIR = flag("subdir", "events");
const CLONE_DIR = path.resolve(__dirname, ".vault-cache");
const VAULT = flag("vault", "") || path.join(CLONE_DIR, REPO_SUBDIR);
const OUT = path.resolve(__dirname, flag("out", "./src/content/events"));

// ── Helpers ──
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Callout transformer ──
// Converts Obsidian callouts to HTML divs with classes
function transformCallouts(md) {
  const lines = md.split("\n");
  const out = [];
  let inCallout = false;
  let calloutType = "";
  let calloutTitle = "";
  let calloutBody = [];

  function flushCallout() {
    if (!inCallout) return;
    const body = calloutBody.join("\n").trim();
    out.push(`<div class="callout callout-${calloutType}">`);
    if (calloutTitle) {
      out.push(`<div class="callout-title">${calloutTitle}</div>`);
    }
    out.push(`<div class="callout-body">\n\n${body}\n\n</div>`);
    out.push(`</div>\n`);
    inCallout = false;
    calloutType = "";
    calloutTitle = "";
    calloutBody = [];
  }

  for (const line of lines) {
    // Start of a callout: > [!type] Optional Title
    const calloutStart = line.match(/^>\s*\[!(\w+)\]\s*(.*)/);
    if (calloutStart) {
      flushCallout();
      inCallout = true;
      calloutType = calloutStart[1].toLowerCase();
      calloutTitle = calloutStart[2].trim();
      continue;
    }

    // Continuation of a callout
    if (inCallout && line.startsWith("> ")) {
      calloutBody.push(line.slice(2));
      continue;
    }
    if (inCallout && line === ">") {
      calloutBody.push("");
      continue;
    }

    // End of callout (non-blockquote line)
    if (inCallout) {
      flushCallout();
    }

    out.push(line);
  }

  flushCallout();
  return out.join("\n");
}

// ── Schedule-meta transformer ──
// Extracts %%schedule-meta%% blocks and converts .talk/.speaker spans to modal triggers
let currentAstroSlug = "";

// Inline SVG globe icon (16x16) for speaker URLs
const globeSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline-block;vertical-align:-0.15em;margin-left:0.25em'><circle cx='12' cy='12' r='10'/><path d='M2 12h20'/><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/></svg>`;

function transformScheduleMeta(md) {
  const metaRegex = /%%schedule-meta%%([\s\S]*?)%%end-schedule-meta%%/g;
  const entries = {};
  let cleaned = md;

  let match;
  while ((match = metaRegex.exec(md)) !== null) {
    const block = match[1].trim();
    // Parse entries separated by ---
    const rawEntries = block.split(/\n---\n/);

    for (const raw of rawEntries) {
      const lines = raw.trim().split("\n");
      if (lines.length === 0) continue;

      // First line is ### heading
      const heading = lines[0].replace(/^###\s*/, "").trim();
      const isBio = heading.startsWith("bio:");
      const name = isBio ? heading.replace("bio:", "").trim() : heading;

      // Parse key-value pairs
      const meta = { name, isBio, abstract: "" };
      let bodyStart = 1;

      for (let i = 1; i < lines.length; i++) {
        const kvMatch = lines[i].match(/^(\w[\w-]*):\s*(.*)/);
        if (kvMatch) {
          meta[kvMatch[1]] = kvMatch[2].trim();
          bodyStart = i + 1;
        } else {
          bodyStart = i;
          break;
        }
      }

      meta.abstract = lines.slice(bodyStart).join("\n").trim();
      const key = isBio ? `bio:${name}` : name;
      entries[key] = meta;
    }

    // Remove the meta block from content
    cleaned = cleaned.replace(match[0], "");
  }

  // Now transform [text]{.talk} and [text]{.speaker} into clickable elements
  cleaned = cleaned.replace(/\[([^\]]+)\]\{\.talk\}/g, (_, title) => {
    const entry = entries[title];
    if (entry && entry.abstract) {
      const escapedAbstract = escapeHtml(entry.abstract);
      const escapedTitle = escapeHtml(title);
      const speakerPhoto = entry["speaker-photo"] || entry.photo || "";
      const speakerName = entry.speaker || "";
      const speakerAff = entry["speaker-affiliation"] || "";

      let content = "";
      if (speakerPhoto) {
        content += `<div class='flex items-start gap-4 mb-4'>`;
        content += `<img src='/events/${currentAstroSlug}/${escapeHtml(speakerPhoto)}' alt='${escapeHtml(speakerName)}' class='w-16 h-16 rounded-full object-cover shrink-0' />`;
        content += `<div>`;
      }
      const speakerUrl = entry["speaker-url"] || entry.url || "";
      content += `<h3 class='text-lg font-medium text-base-900 ${speakerPhoto ? "" : "mb-4"}'>${escapedTitle}</h3>`;
      content += `<p class='text-sm text-base-500 mb-2'><em>by ${escapeHtml(speakerName)}</em>${speakerAff ? `, ${escapeHtml(speakerAff)}` : ""}`;
      if (speakerUrl) content += ` <a href='${escapeHtml(speakerUrl)}' target='_blank' class='text-accent-600 hover:text-accent-500 inline-block align-middle' title='Website'>${globeSvg}</a>`;
      content += `</p>`;
      if (speakerPhoto) {
        content += `</div></div>`;
      }
      content += `<div class='text-sm text-base-600 leading-relaxed'>${escapedAbstract.replace(/\n/g, "<br>")}</div>`;

      return `<a href="#" class="talk-trigger text-accent-600 hover:text-accent-500 underline decoration-dotted cursor-pointer" data-modal-content="${escapeAttr(content)}">${title}</a>`;
    }
    return `**${title}**`;
  });

  cleaned = cleaned.replace(/\[([^\]]+)\]\{\.speaker\}/g, (_, name) => {
    const entry = entries[`bio:${name}`] || Object.values(entries).find((e) => e.speaker === name || e.name === name);
    if (entry) {
      const bio = entry.abstract || "";
      const url = entry.url || entry["speaker-url"] || "";
      const affiliation = entry.affiliation || entry["speaker-affiliation"] || "";
      const photo = entry.photo || entry["speaker-photo"] || "";

      let content = "";
      if (photo) {
        content += `<div class='flex items-start gap-4 mb-4'>`;
        content += `<img src='/events/${currentAstroSlug}/${escapeHtml(photo)}' alt='${escapeHtml(name)}' class='w-20 h-20 rounded-full object-cover shrink-0' />`;
        content += `<div>`;
      }
      content += `<h3 class='text-lg font-medium text-base-900 mb-1'>${escapeHtml(name)}`;
      if (url) content += ` <a href='${escapeHtml(url)}' target='_blank' class='text-accent-600 hover:text-accent-500 inline-block align-middle' title='Website'>${globeSvg}</a>`;
      content += `</h3>`;
      if (affiliation) content += `<p class='text-sm text-base-400 mb-3'>${escapeHtml(affiliation)}</p>`;
      if (photo) {
        content += `</div></div>`;
      }
      if (bio) content += `<div class='text-sm text-base-600 leading-relaxed'>${escapeHtml(bio).replace(/\n/g, "<br>")}</div>`;

      return `<a href="#" class="speaker-trigger text-base-600 hover:text-accent-600 underline decoration-dotted cursor-pointer" data-modal-content="${escapeAttr(content)}">${name}</a>`;
    }
    return `**${name}**`;
  });

  return cleaned;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

// ── Schedule tabs transformer ──
// Detects schedule sections and wraps ### sub-headings into tabbed panels.
// Convention: "## Schedule" followed by ### headings that become tabs.
// Use ### for tab-level grouping (e.g. "### Week I …", "### Day 1 …")
// and #### for content within each tab.
function transformScheduleTabs(md) {
  // Find schedule sections: starts with ## Schedule, ends at next ## heading or end of string
  const scheduleRegex = /^(#{2}\s+(?:📅\s*)?Schedule[^\n]*)\n([\s\S]*?)(?=\n#{2}\s[^#]|$(?!\n))/gm;

  return md.replace(scheduleRegex, (fullMatch, heading, body) => {
    // Look for ### headings (these become tabs)
    const tabRegex = /^###\s+([^\n]+)/gm;
    const tabs = [];
    let tabMatch;

    while ((tabMatch = tabRegex.exec(body)) !== null) {
      tabs.push({ title: tabMatch[1].trim(), index: tabMatch.index });
    }

    // If fewer than 2 tabs, no tabbing needed
    if (tabs.length < 2) return fullMatch;

    // Split body into tab panels
    const panels = tabs.map((tab, i) => {
      const start = tab.index;
      const end = i + 1 < tabs.length ? tabs[i + 1].index : body.length;
      // Remove the ### heading itself from the panel content
      const content = body.slice(start).slice(body.slice(start).indexOf("\n") + 1, end - start);
      return { title: tab.title, content: content.trim(), id: `tab-${i + 1}` };
    });

    // Build tabbed HTML
    let html = `${heading}\n\n`;
    html += `<div class="schedule-tabbed">\n`;
    html += `<div class="schedule-tabs">\n`;
    panels.forEach((p, i) => {
      html += `<button class="schedule-tab${i === 0 ? " active" : ""}" data-tab="${p.id}">${p.title}</button>\n`;
    });
    html += `</div>\n`;
    panels.forEach((p, i) => {
      html += `<div class="schedule-panel${i === 0 ? " active" : ""}" data-panel="${p.id}">\n\n${p.content}\n\n</div>\n`;
    });
    html += `</div>\n`;

    return html;
  });
}

// ── Main transformer pipeline ──
function transformMarkdown(md) {
  let result = md;

  // 1. Transform schedule-meta blocks (before callouts, since callouts won't be inside meta)
  result = transformScheduleMeta(result);

  // 2. Transform multi-day schedules into tabbed layout
  result = transformScheduleTabs(result);

  // 3. Transform Obsidian callouts to HTML
  result = transformCallouts(result);

  // 4. Clean up any double blank lines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}

// ── Frontmatter extraction ──
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: "", body: content };
  return { frontmatter: match[1], body: match[2] };
}

// ── Walk the vault ──
function findEvents(vaultDir) {
  const events = [];
  const years = fs.readdirSync(vaultDir).filter((d) => {
    return /^\d{4}$/.test(d) && fs.statSync(path.join(vaultDir, d)).isDirectory();
  });

  for (const year of years) {
    const yearDir = path.join(vaultDir, year);
    const slugs = fs.readdirSync(yearDir).filter((d) => {
      return fs.statSync(path.join(yearDir, d)).isDirectory();
    });

    for (const slug of slugs) {
      const publicDir = path.join(yearDir, slug, "public");
      if (!fs.existsSync(publicDir)) continue;

      const files = fs.readdirSync(publicDir).filter((f) => f.endsWith(".md"));
      if (files.length === 0) continue;

      events.push({
        year,
        slug,
        publicDir,
        files,
        astroSlug: `${year}-${slug}`,
      });
    }
  }

  return events;
}

// ── Sync repo ──
if (!flag("vault", "")) {
  const repoUrl = `https://github.com/${REPO}.git`;
  if (fs.existsSync(path.join(CLONE_DIR, ".git"))) {
    console.log(`🔄 Pulling latest from ${REPO}...`);
    execSync("git pull --ff-only", { cwd: CLONE_DIR, stdio: "inherit" });
  } else {
    console.log(`📥 Cloning ${REPO}...`);
    execSync(`git clone --depth 1 ${repoUrl} "${CLONE_DIR}"`, { stdio: "inherit" });
  }
  console.log();
}

// ── Process ──
console.log(`📖 Reading vault: ${VAULT}`);
console.log(`📝 Output to:     ${OUT}`);
if (dryRun) console.log("🔍 Dry run mode — no files will be written.\n");

const events = findEvents(VAULT);
console.log(`Found ${events.length} events.\n`);

if (!dryRun) {
  // Clean output directory
  if (fs.existsSync(OUT)) {
    fs.rmSync(OUT, { recursive: true });
  }
  ensureDir(OUT);
}

let successCount = 0;
let errorCount = 0;

for (const event of events) {
  for (const file of event.files) {
    const inputPath = path.join(event.publicDir, file);
    const raw = fs.readFileSync(inputPath, "utf-8");
    const { frontmatter, body } = extractFrontmatter(raw);

    if (!frontmatter) {
      console.warn(`⚠️  Skipping ${inputPath} — no frontmatter found`);
      errorCount++;
      continue;
    }

    // Set current slug for image paths in modals
    currentAstroSlug = event.astroSlug;

    // Transform the body
    const transformed = transformMarkdown(body);

    // Determine output filename
    let outName;
    if (file === "index.md") {
      outName = `${event.astroSlug}.md`;
    } else {
      const basename = path.basename(file, ".md");
      outName = `${event.astroSlug}-${basename}.md`;
    }

    const output = `---\n${frontmatter}\n---\n${transformed}`;

    if (dryRun) {
      console.log(`  Would write: ${outName} (${output.length} bytes)`);
    } else {
      fs.writeFileSync(path.join(OUT, outName), output);
      console.log(`  ✓ ${outName}`);
    }
    successCount++;
  }

  // Copy images
  if (!dryRun) {
    const images = fs.readdirSync(event.publicDir).filter((f) => {
      return /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f);
    });
    if (images.length > 0) {
      const imgOutDir = path.join(__dirname, "public", "events", event.astroSlug);
      ensureDir(imgOutDir);
      for (const img of images) {
        fs.copyFileSync(
          path.join(event.publicDir, img),
          path.join(imgOutDir, img)
        );
        console.log(`  📷 ${img} → public/events/${event.astroSlug}/`);
      }
    }
  }
}

console.log(`\n✅ Done: ${successCount} files processed, ${errorCount} errors.`);
