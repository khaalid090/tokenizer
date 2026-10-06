const fs = require("fs");
const s = fs.readFileSync(
  "C:/Users/pc/Documents/tokentrim/lib/optimizer/index.ts",
  "utf8"
);
const lines = s.split("\r\n");
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (
    /restructure|trimOutputRequirements|outputTrimmed =|compressed =/.test(l) &&
    !/^import/.test(l)
  ) {
    console.log((i + 1) + ": " + l);
  }
}