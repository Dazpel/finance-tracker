const { heroui } = require("@heroui/react");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",

    // Or if using `src` directory:
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-roboto)'],
      },
      colors: {
        black: "#14171c",
        darkTheme: "#15171c",
      }
    },
  },
  darkMode: "class",
  plugins: [heroui({
    themes:{
      light:{
        colors:{
          background: "#FAFAFA",
          danger: {
            DEFAULT: "#D32F2F",
          }
        }
      },
      dark:{
        colors:{
          background: "#15171c",
          danger: {
            DEFAULT: "#F44336",
          }
        }
      }
    }
  })],
};