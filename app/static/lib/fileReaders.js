// Estrazione testo grezzo da CSV / XLSX / PDF via CDN.
// Il Parser Agent legge questo raw + un preview strutturato.

const cdn = {
  papa: "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js",
  xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
  pdfjsWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
};

const _loaded = new Set();
function loadScript(src) {
  if (_loaded.has(src)) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = () => { _loaded.add(src); res(); };
    s.onerror = () => rej(new Error("script fail: " + src));
    document.head.appendChild(s);
  });
}

export async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || file.type === "text/csv") {
    return readCsv(file);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return readXlsx(file);
  if (name.endsWith(".pdf") || file.type === "application/pdf") return readPdf(file);
  // fallback: leggi come testo
  const text = await file.text();
  return { kind: "text", raw: text, preview: text.slice(0, 4000) };
}

async function readCsv(file) {
  await loadScript(cdn.papa);
  const text = await file.text();
  const parsed = window.Papa.parse(text, { header: false, skipEmptyLines: true });
  const rows = parsed.data.slice(0, 200);
  return { kind: "csv", raw: text, preview: rows.slice(0, 30).map(r => r.join(" | ")).join("\n"), rows };
}

async function readXlsx(file) {
  await loadScript(cdn.xlsx);
  const buf = await file.arrayBuffer();
  const wb = window.XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }).slice(0, 200);
  const preview = rows.slice(0, 30).map(r => r.join(" | ")).join("\n");
  return { kind: "xlsx", raw: preview, preview, rows };
}

async function readPdf(file) {
  await loadScript(cdn.pdfjs);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = cdn.pdfjsWorker;
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(" ") + "\n";
  }
  return { kind: "pdf", raw: text, preview: text.slice(0, 4000) };
}
