/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",       // root HTML
    "./**/*.html",    // HTML in subfolders
    "./*.js",         // root JS
    "./**/*.{html,js}",
    "./**/*.js"       // JS in subfolders
  ],
   safelist: ["text-red-500", "bg-gray-100", "bg-blue-500", "hover:bg-blue-600"],

  theme: {
    extend: {},
  },
  plugins: [],
};
