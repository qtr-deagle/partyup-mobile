/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  // lib/**  (theme.ts, carpool.ts, trustedCircle.ts, etc.) builds className
  // strings that are returned to screens/components rather than written
  // inline -- without this, NativeWind never scans those files, so those
  // classes never make it into the compiled stylesheet. The elements render
  // with no color style at all, which defaults to black text -- invisible in
  // dark mode but easy to miss in light mode since black-on-white still reads.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./lib/**/*.{js,jsx,ts,tsx}", "./hooks/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontSize: {
        // Headline scale: size, line-height, letter-spacing (px equivalents of
        // the -2%/-1% tracking spec). Pair with font-medium (weight 500).
        'headline-32': ['32px', { lineHeight: '40px', letterSpacing: '-0.64px' }],
        'headline-28': ['28px', { lineHeight: '36px', letterSpacing: '-0.56px' }],
        'headline-24': ['24px', { lineHeight: '32px', letterSpacing: '-0.48px' }],
        'headline-20': ['20px', { lineHeight: '28px', letterSpacing: '-0.4px' }],
        'headline-18': ['18px', { lineHeight: '26px', letterSpacing: '-0.18px' }],
      },
    },
  },
  plugins: [],
}