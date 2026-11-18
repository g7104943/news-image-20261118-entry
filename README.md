# The World Today — 18 November 2026

[![make.fun](https://make.fun/badge/news-image-20261118.svg)](https://make.fun/bounty/news-image-20261118)
[![rank](https://make.fun/badge/news-image-20261118/g7104943/news-image-20261118-entry/rank.svg)](https://make.fun/bounty/news-image-20261118)
[![reward](https://make.fun/badge/news-image-20261118/g7104943/news-image-20261118-entry/reward.svg)](https://make.fun/bounty/news-image-20261118)

A newspaper front page that sums up the world's news of Wednesday
**18 November 2026** in one image.

`main.ts` (Node 22, standard library only) draws the whole page from
scratch — masthead, four illustrated stories and an "also today" strip —
with a hand-written PNG encoder and a built-in 5×7 bitmap font. No
network, no external files: it runs twice and writes byte-identical
`entry.png` (1024×1024, under 1 MiB).

## The day's stories

1. **Four leaders, one table** — Trump, Modi, Takaichi and Albanese meet
   in Manila for the Quad's first leaders' summit in two years, agreeing
   five outcomes from maritime surveillance to a business forum in Mumbai.
2. **Kerch Bridge arch falls** — Ukraine hits the Crimean Bridge a second
   day running; its road arch collapses into the strait. Russia hits
   Kyiv's two Dnipro bridges in reply.
3. **US loses measles-free status** — After 26 years, health chiefs say
   measles is spreading again in the US: 5,412 cases in 2026, the worst
   outbreak in over three decades.
4. **Gulf on edge** — Iran's Revolutionary Guard says its drones hit a US
   radar at Sheikh Isa base in Bahrain, the third attack in five days;
   US jets then hit a missile site on Iran's Qeshm Island.

Also today: Mongolia's president resigns amid graft charges; Nvidia's
board rules out Jensen Huang's return as sales hit $115.8bn; Japan
protests Russian jets in its airspace; Dhoni retires from the IPL;
Cyclone Akvan nears the Andhra coast.

Sources are listed in [research.md](research.md).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024 PNG, 22,356 bytes). Two runs
produce byte-identical output (sha256
`3129168f72a6b2cba9ea1f8d9d1202f135e656701faa6f072ea8ea8aef8d07e8`).
