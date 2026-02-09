import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bone: {
          DEFAULT: "#FAF9F7",
          100: "#F4F1EC",
          200: "#EBE6DF",
        },
        ink: {
          DEFAULT: "#111111",
          600: "#272727",
          500: "#3A3A3A",
        },
        graphite: {
          DEFAULT: "#1C1C1E",
          700: "#131315",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          700: "#33756E",
          100: "#EAF4F2",
          50: "#F4FAF9",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontSize: {
        "display-lg": [
          "clamp(2.15rem, 2.1vw + 1.45rem, 3.35rem)",
          { lineHeight: "1.02", letterSpacing: "-0.035em", fontWeight: "650" },
        ],
        "display-md": [
          "clamp(1.8rem, 1.5vw + 1.2rem, 2.6rem)",
          { lineHeight: "1.06", letterSpacing: "-0.03em", fontWeight: "630" },
        ],
      },
    },
  },
  plugins: [],
};

export default config;
