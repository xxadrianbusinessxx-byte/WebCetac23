const fs = require("fs");
const files = process.argv.slice(2);
for (const p of files) {
  let t = fs.readFileSync(p, "utf8");
  t = t.replace(/<\/?motionlessScroll\b/g, (m) =>
    m.startsWith("</") ? "</motionlessScroll" : "<motionlessScroll",
  );
  t = t.replace(/<\/motionlessScroll>/g, "</div>");
  t = t.replace(/<motionlessScroll\b/g, "<div");
  fs.writeFileSync(p, t);
  console.log(p, "ok");
}
