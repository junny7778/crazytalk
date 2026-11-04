export default {
  corePlugins: { preflight: false },
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "var(--ct-white)",
      brand: Object.fromEntries(
        [50, 100, 200, 500, 600, 700, 800, 900].map((n) => [
          n,
          `var(--ct-brand-${n})`,
        ]),
      ),
      gray: Object.fromEntries(
        [50, 100, 200, 300, 400, 500, 700, 900].map((n) => [
          n,
          `var(--ct-gray-${n})`,
        ]),
      ),
    },
    borderRadius: {
      item: "4px",
      tag: "6px",
      control: "8px",
      inset: "12px",
      panel: "14px",
      dialog: "16px",
      full: "9999px",
    },
    extend: {
      fontFamily: {
        sans: ["HarmonyOS Sans SC", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
};
