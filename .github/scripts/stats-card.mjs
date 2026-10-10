// Generates a "radical" themed GitHub stats card whose commit total includes
// private contributions (the public github-readme-stats instance ignores them).
// Usage: GH_TOKEN=... node stats-card.mjs <username> <output.svg>
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const [username = "FabienDebouse", output = "assets/github-stats.svg"] = process.argv.slice(2);
const token = process.env.GH_TOKEN;
if (!token) throw new Error("GH_TOKEN is required");

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

const { user } = await gql(
  `query($login: String!) {
    user(login: $login) {
      name login createdAt
      followers { totalCount }
      pullRequests { totalCount }
      issues { totalCount }
      repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) { totalCount }
      contributionsCollection { totalPullRequestReviewContributions }
      repositories(ownerAffiliations: OWNER, first: 100) { nodes { stargazerCount } }
    }
  }`,
  { login: username },
);

// contributionsCollection spans at most one year, so sum it year by year.
let commits = 0;
const now = new Date();
for (let from = new Date(user.createdAt); from < now; ) {
  const to = new Date(Math.min(new Date(from).setFullYear(from.getFullYear() + 1), now));
  const { user: u } = await gql(
    `query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) { totalCommitContributions restrictedContributionsCount }
      }
    }`,
    { login: username, from: from.toISOString(), to: to.toISOString() },
  );
  const c = u.contributionsCollection;
  commits += c.totalCommitContributions + c.restrictedContributionsCount;
  from = to;
}

const stats = {
  stars: user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0),
  commits,
  prs: user.pullRequests.totalCount,
  issues: user.issues.totalCount,
  contributedTo: user.repositoriesContributedTo.totalCount,
  reviews: user.contributionsCollection.totalPullRequestReviewContributions,
  followers: user.followers.totalCount,
};

// Same ranking formula as github-readme-stats (all-commits mode).
function rank({ commits, prs, issues, reviews, stars, followers }) {
  const exp = (x) => 1 - 2 ** -x;
  const logNormal = (x) => x / (1 + x);
  const parts = [
    [2, exp(commits / 1000)],
    [3, exp(prs / 50)],
    [1, exp(issues / 25)],
    [1, exp(reviews / 2)],
    [4, logNormal(stars / 50)],
    [1, logNormal(followers / 10)],
  ];
  const totalWeight = parts.reduce((s, [w]) => s + w, 0);
  const percentile = (1 - parts.reduce((s, [w, v]) => s + w * v, 0) / totalWeight) * 100;
  const thresholds = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
  const levels = ["S", "A+", "A", "A-", "B+", "B", "B-", "C+", "C"];
  return { level: levels[thresholds.findIndex((t) => percentile <= t)], percentile };
}

const icons = {
  star: "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z",
  commits: "M1.643 3.143 .427 1.927A.25.25 0 0 0 0 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 0 0 .177-.427L2.715 4.215a6.5 6.5 0 1 1-1.18 4.458.75.75 0 1 0-1.493.154 8.001 8.001 0 1 0 1.6-5.684ZM7.75 4a.75.75 0 0 1 .75.75v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5A.75.75 0 0 1 7.75 4Z",
  prs: "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
  issues: "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
  contributedTo: "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z",
};

const rows = [
  ["star", "Total Stars Earned:", stats.stars],
  ["commits", "Total Commits:", stats.commits],
  ["prs", "Total PRs:", stats.prs],
  ["issues", "Total Issues:", stats.issues],
  ["contributedTo", "Contributed to (last year):", stats.contributedTo],
];

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const { level, percentile } = rank(stats);
const circumference = 2 * Math.PI * 40;
const progressOffset = circumference * (1 - (100 - percentile) / 100);
const title = `${escape(user.name || user.login)}'s GitHub Stats`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="467" height="195" viewBox="0 0 467 195" fill="none" role="img" aria-labelledby="title">
  <title id="title">${title}</title>
  <style>
    .header { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #fe428e; animation: fadeIn .8s ease-in-out backwards; }
    .stat { font: 600 14px 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif; fill: #a9fef7; }
    .bold { font-weight: 700; }
    .icon { fill: #f8d847; }
    .stagger { animation: fadeIn .3s ease-in-out backwards; }
    .rank-text { font: 800 24px 'Segoe UI', Ubuntu, Sans-Serif; fill: #a9fef7; }
    .rank-circle-rim { stroke: #fe428e; fill: none; stroke-width: 6; opacity: .2; }
    .rank-circle { stroke: #fe428e; stroke-dasharray: ${circumference.toFixed(2)}; fill: none; stroke-width: 6; stroke-linecap: round;
      stroke-dashoffset: ${progressOffset.toFixed(2)}; transform: rotate(-90deg); transform-origin: 0 0; animation: rankAnimation 1s backwards ease-in-out; }
    @keyframes rankAnimation { from { stroke-dashoffset: ${circumference.toFixed(2)}; } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  </style>
  <rect x="0.5" y="0.5" rx="4.5" width="466" height="99%" fill="#141321"/>
  <text x="25" y="35" class="header">${title}</text>
  <g transform="translate(0, 55)">
${rows
  .map(
    ([icon, label, value], i) => `    <g class="stagger" style="animation-delay: ${450 + i * 150}ms" transform="translate(25, ${i * 25})">
      <svg class="icon" viewBox="0 0 16 16" width="16" height="16"><path fill-rule="evenodd" d="${icons[icon]}"/></svg>
      <text class="stat bold" x="25" y="12.5">${label}</text>
      <text class="stat bold" x="219.01" y="12.5">${fmt(value)}</text>
    </g>`,
  )
  .join("\n")}
  </g>
  <g transform="translate(390.5, 97.5)">
    <circle class="rank-circle-rim" cx="0" cy="0" r="40"/>
    <circle class="rank-circle" cx="0" cy="0" r="40"/>
    <text class="rank-text" x="0" y="0" text-anchor="middle" dominant-baseline="central">${level}</text>
  </g>
</svg>
`;

await mkdir(dirname(output), { recursive: true });
await writeFile(output, svg);
console.log(JSON.stringify({ ...stats, rank: level }));
