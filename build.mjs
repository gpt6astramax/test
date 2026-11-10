// 扫描根目录下的每个子文件夹，生成：
//   .build/routes.js       —— 各子项目 worker.js 的汇总导入
//   .build/assets/<name>/  —— 各子项目的静态文件
// 由 wrangler.jsonc 的 build.command 在 deploy / dev 前自动执行。
//
// 任何一个子项目出问题（构建失败、worker.js 打包不过）都只跳过它自己，
// 不会挡住其他子项目的部署。
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, ".build");
const assetsOut = path.join(out, "assets");

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const RESERVED = new Set(["node_modules"]);
// 整个文件夹当静态站点时，不对外公开的文件
const STATIC_EXCLUDE = new Set(["node_modules", "package.json", "package-lock.json", "README.md"]);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(assetsOut, { recursive: true });

let esbuild = null;
try {
  esbuild = await import("esbuild");
} catch {
  console.warn("[build] 未安装 esbuild，跳过 worker.js 预检查");
}

const projects = [];
const skipped = [];

for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const name = entry.name;
  if (name.startsWith(".") || name.startsWith("_") || RESERVED.has(name)) continue;
  if (!NAME_RE.test(name)) {
    skipped.push([name, "文件夹名只能用小写字母、数字、连字符"]);
    continue;
  }
  const dir = path.join(root, name);

  try {
    // 子项目自带 package.json：装依赖；有 build 脚本就跑一下
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const hasDeps = pkg.dependencies || pkg.devDependencies;
      if (hasDeps) execSync("npm install --no-audit --no-fund", { cwd: dir, stdio: "inherit" });
      if (pkg.scripts?.build) execSync("npm run build", { cwd: dir, stdio: "inherit" });
    }

    const workerFile = path.join(dir, "worker.js");
    const hasWorker = fs.existsSync(workerFile);
    if (hasWorker && esbuild) await checkWorker(workerFile);

    // 静态文件：有 public/ 用 public/；否则没有 worker.js 时整个文件夹都是静态站点
    const publicDir = path.join(dir, "public");
    let hasStatic = false;
    if (fs.existsSync(publicDir)) {
      hasStatic = copyStatic(publicDir, path.join(assetsOut, name), false);
    } else if (!hasWorker) {
      hasStatic = copyStatic(dir, path.join(assetsOut, name), true);
    }

    if (!hasWorker && !hasStatic) {
      skipped.push([name, "既没有 worker.js 也没有静态文件"]);
      continue;
    }
    projects.push({ name, worker: hasWorker, static: hasStatic });
  } catch (err) {
    fs.rmSync(path.join(assetsOut, name), { recursive: true, force: true });
    skipped.push([name, String(err?.message ?? err).split("\n")[0]]);
  }
}

const withWorker = projects.filter((p) => p.worker);
const lines = [
  "// 由 build.mjs 自动生成，不要手改",
  ...withWorker.map((p, i) => `import w${i} from ${JSON.stringify(`../${p.name}/worker.js`)};`),
  "",
  `export const workers = { ${withWorker.map((p, i) => `${JSON.stringify(p.name)}: w${i}`).join(", ")} };`,
  `export const projects = ${JSON.stringify(projects, null, 2)};`,
  "",
];
fs.writeFileSync(path.join(out, "routes.js"), lines.join("\n"));

console.log(`[build] ${projects.length} 个子项目：`);
for (const p of projects) {
  console.log(`  /${p.name}  ${[p.worker && "worker", p.static && "static"].filter(Boolean).join(" + ")}`);
}
for (const [name, why] of skipped) console.warn(`[build] 已跳过 ${name}/ ：${why}`);

// 递归复制静态文件。返回是否复制到了至少一个文件。
function copyStatic(src, dest, isProjectRoot) {
  let copied = false;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    if (isProjectRoot && STATIC_EXCLUDE.has(e.name)) continue;
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      if (copyStatic(from, to, false)) copied = true;
    } else if (e.isFile()) {
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(from, to);
      copied = true;
    }
  }
  return copied;
}

// 单独试打包一次 worker.js，语法错误 / 缺依赖在这里就被拦下
async function checkWorker(file) {
  const passthrough = Object.fromEntries(
    [".wasm", ".txt", ".html", ".sql", ".bin", ".css", ".svg", ".png", ".jpg"].map((ext) => [ext, "empty"]),
  );
  try {
    await esbuild.build({
      entryPoints: [file],
      bundle: true,
      write: false,
      format: "esm",
      target: "esnext",
      platform: "browser",
      conditions: ["workerd", "worker", "browser"],
      external: ["cloudflare:*", "node:*"],
      loader: passthrough,
      logLevel: "silent",
    });
  } catch (err) {
    const first = err?.errors?.[0];
    const where = first?.location ? ` (${first.location.file}:${first.location.line})` : "";
    throw new Error(`worker.js 打包失败：${first?.text ?? err.message}${where}`);
  }
}
