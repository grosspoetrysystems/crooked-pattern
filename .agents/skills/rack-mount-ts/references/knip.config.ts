import type { KnipConfig } from "knip";

const config: KnipConfig = {
  project: ["src/**/*.ts"],
  ignoreDependencies: ["@biomejs/biome"],
};

export default config;
