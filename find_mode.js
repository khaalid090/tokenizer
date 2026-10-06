const fs = require("fs");
const s = fs.readFileSync(
  "C:/Users/pc/Documents/tokentrim/lib/optimizer/index.ts",
  "utf8"
);
const lines = s.split("\r\n");
lines.forEach((l, i) => {
  if (/\bmode\b/.test(l) && !/effectiveMode|interface|OptimizeOptions|CompressionMode|options\.mode|mode = options|: mode|mode,|mode\)|mode\)|export function optimizePrompt/.test(l)) {
    console.log((i + 1) + ": " + l);
  }
});