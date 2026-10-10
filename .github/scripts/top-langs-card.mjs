// Generates a "radical" themed "Most Used Languages" card from all owned repos,
// private ones included (the public github-readme-stats instance only sees public repos).
// Usage: GH_TOKEN=<token with private repo read access> node top-langs-card.mjs <username> <output.svg>
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const [username = "FabienDebouse", output = "assets/top-langs.svg"] = process.argv.slice(2);
const token = process.env.GH_TOKEN;
if (!token) throw new Error("GH_TOKEN is required");

const LANGS_COUNT = 8;

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data;
}

const sizes = new Map();
for (let cursor = null, hasNext = true; hasNext; ) {
  const { user } = await gql(
    `query($login: String!, $cursor: String) {
      user(login: $login) {
        repositories(ownerAffiliations: OWNER, isFork: false, first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
              edges { size node { name color } }
            }
          }
        }
      }
    }`,
    { login: username, cursor },
  );
  const { nodes, pageInfo } = user.repositories;
  for (const { size, node } of nodes.flatMap((r) => r.languages.edges)) {
    const entry = sizes.get(node.name) ?? { name: node.name, color: node.color ?? "#858585", size: 0 };
    entry.size += size;
    sizes.set(node.name, entry);
  }
  ({ hasNextPage: hasNext, endCursor: cursor } = pageInfo);
}

const langs = [...sizes.values()].sort((a, b) => b.size - a.size).slice(0, LANGS_COUNT);
if (langs.length === 0) {
  // Without private repo access there is nothing meaningful to show: keep the existing card.
  console.log("No languages found, card left unchanged.");
  process.exit(0);
}
const total = langs.reduce((sum, l) => sum + l.size, 0);
for (const l of langs) l.percent = (l.size / total) * 100;

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const barWidth = 417;
let offset = 0;
const segments = langs
  .map((l) => {
    const width = (l.percent / 100) * barWidth;
    const rect = `<rect x="${offset.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="8" fill="${l.color}"/>`;
    offset += width;
    return rect;
  })
  .join("\n      ");

const rows = Math.ceil(langs.length / 2);
const legend = langs
  .map((l, i) => {
    const x = i < rows ? 0 : 220;
    const y = (i % rows) * 25;
    return `    <g class="stagger" style="animation-delay: ${450 + i * 100}ms" transform="translate(${x}, ${y})">
      <circle cx="5" cy="6" r="5" fill="${l.color}"/>
      <text class="lang-name" x="15" y="10">${escape(l.name)} ${l.percent.toFixed(2)}%</text>
    </g>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="467" height="195" viewBox="0 0 467 195" fill="none" role="img" aria-labelledby="title">
  <title id="title">Most Used Languages</title>
  <style>
    .header { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #fe428e; animation: fadeIn .8s ease-in-out backwards; }
    .lang-name { font: 400 13px 'Segoe UI', Ubuntu, Sans-Serif; fill: #a9fef7; }
    .stagger { animation: fadeIn .3s ease-in-out backwards; }
    .bar { animation: grow .8s ease-in-out backwards; transform-origin: left; }
    @keyframes fadeIn { from { opacity: 0; } }
    @keyframes grow { from { transform: scaleX(0); } }
  </style>
  <rect x="0.5" y="0.5" rx="4.5" width="466" height="99%" fill="#141321"/>
  <text x="25" y="35" class="header">Most Used Languages</text>
  <g transform="translate(25, 55)">
    <mask id="bar-mask"><rect width="${barWidth}" height="8" rx="5" fill="white"/></mask>
    <g class="bar" mask="url(#bar-mask)">
      ${segments}
    </g>
  </g>
  <g transform="translate(25, 85)">
${legend}
  </g>
</svg>
`;

await mkdir(dirname(output), { recursive: true });
await writeFile(output, svg);
console.log(JSON.stringify(langs.map((l) => `${l.name} ${l.percent.toFixed(2)}%`)));
