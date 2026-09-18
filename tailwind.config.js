/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#16141f",
          muted: "#24222e",
          50: "#f6f4f1",
        },
        cream: {
          50: "#f4efe6",
          100: "#ebe3d6",
        },
        sage: {
          50: "#f3f7f5",
          100: "#e4eee8",
          200: "#c9ddd2",
          800: "#3f5c4f",
          900: "#2c4037",
        },
        brand: {
          50: "#fdf6f3",
          100: "#f8e6df",
          200: "#f0cbbd",
          400: "#e09278",
          500: "#d4785a",
          600: "#c46348",
          700: "#a24e38",
          800: "#7c3c2c",
          900: "#5c2d22",
        },
      },
    },
  },
  plugins: [],
};
