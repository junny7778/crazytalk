import preset from "@crazytalk/ui/tailwind-preset";
export default {
  corePlugins: { preflight: false },
  presets: [preset],
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
};
