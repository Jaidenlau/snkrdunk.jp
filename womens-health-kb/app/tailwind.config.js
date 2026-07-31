/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm, clinical, trustworthy — not clichéd pink.
        canvas: "#FAF8F5",
        surface: "#FFFFFF",
        ink: "#211D1B",
        muted: "#6B625C",
        line: "#EAE4DD",
        plum: {
          50: "#F7F0F4",
          100: "#EBD9E4",
          400: "#A96E8E",
          600: "#7C3F62",
          700: "#63314E",
        },
        // Evidence coding — consistent everywhere.
        strong: { bg: "#E7F3EC", fg: "#1F6B45", dot: "#2E9E63" },
        trad:   { bg: "#FBF0DF", fg: "#8A5B12", dot: "#C98A2B" },
        anec:   { bg: "#F6EBEC", fg: "#9B4A55", dot: "#C56C78" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        serif: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(33,29,27,0.04), 0 8px 24px -12px rgba(33,29,27,0.10)",
      },
    },
  },
  plugins: [],
};
