// Tailwind v4 reads most of its config from `@theme` in src/app/globals.css.
// This file exists only to point Tailwind at our source tree for class scanning.
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", "[data-theme='dark']"],
};

export default config;
