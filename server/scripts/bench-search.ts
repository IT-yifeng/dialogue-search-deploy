// 搜索接口耗时基准：输出 p50/p95/p99，供 M7 验收（预热后再跑）。
import { performance } from 'node:perf_hooks';

const base = (process.env.BASE ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const q = process.env.BENCH_Q ?? 'penny';
const n = Math.max(10, Number(process.env.BENCH_N ?? 100));
const warmup = Math.min(10, Math.floor(n / 5));

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

async function once(): Promise<number> {
  const t0 = performance.now();
  const res = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}&pageSize=20`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await res.json();
  return performance.now() - t0;
}

async function main() {
  for (let i = 0; i < warmup; i++) await once();
  const samples: number[] = [];
  for (let i = 0; i < n; i++) samples.push(await once());
  samples.sort((a, b) => a - b);
  const line = (label: string, v: number) => `${label}: ${v.toFixed(1)} ms`;
  console.log(`BASE=${base}  q=${q}  n=${n}`);
  console.log(line('p50', percentile(samples, 50)));
  console.log(line('p95', percentile(samples, 95)));
  console.log(line('p99', percentile(samples, 99)));
  if (percentile(samples, 95) >= 300) process.exitCode = 1;
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
