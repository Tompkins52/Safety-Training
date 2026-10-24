// ---------------------------------------------------------------- minimal .xlsx writer (no dependencies)
// Builds a real Excel workbook: a zip archive (stored, no compression) holding the OOXML parts.
var CRC_TABLE = (function () {
  var t = [], c;
  for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function utf8(str) { return new TextEncoder().encode(str); }
function le16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
function le32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }
function dosDateTime(d) {
  var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time, date: date };
}
function zipStore(files) {
  var parts = [], central = [], offset = 0, now = dosDateTime(new Date());
  files.forEach(function (f) {
    var name = utf8(f.name), data = utf8(f.content), crc = crc32(data);
    var local = [].concat(le32(0x04034b50), le16(20), le16(0x0800), le16(0), le16(now.time), le16(now.date), le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0));
    parts.push(new Uint8Array(local), name, data);
    var cd = [].concat(le32(0x02014b50), le16(20), le16(20), le16(0x0800), le16(0), le16(now.time), le16(now.date), le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset));
    central.push(new Uint8Array(cd), name);
    offset += local.length + name.length + data.length;
  });
  var cdSize = 0;
  central.forEach(function (c) { cdSize += c.length; });
  var end = [].concat(le32(0x06054b50), le16(0), le16(0), le16(files.length), le16(files.length), le32(cdSize), le32(offset), le16(0));
  return new Blob(parts.concat(central, [new Uint8Array(end)]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function xmlEsc(s) { return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function colName(n) { var s = ""; n += 1; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function sheetXML(rows) {
  var widths = [];
  rows.forEach(function (r) { r.forEach(function (v, i) { var l = String(v === null || v === undefined ? "" : v).length; if (!widths[i] || l > widths[i]) widths[i] = l; }); });
  var cols = widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.min(60, Math.max(10, w + 2)) + '" customWidth="1"/>'; }).join("");
  var body = rows.map(function (r, ri) {
    return "<row r=\"" + (ri + 1) + '">' + r.map(function (v, ci) {
      var ref = colName(ci) + (ri + 1);
      if (typeof v === "number") return '<c r="' + ref + '"><v>' + v + "</v></c>";
      var style = ri === 0 ? ' s="1"' : "";
      return '<c r="' + ref + '" t="inlineStr"' + style + "><is><t>" + xmlEsc(v) + "</t></is></c>";
    }).join("") + "</row>";
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + cols + "</cols><sheetData>" + body + "</sheetData></worksheet>";
}
// sheets: [{name, rows: [[cell, ...], ...]}]
function xlsxBlob(sheets) {
  var files = [];
  files.push({ name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") + "</Types>" });
  files.push({ name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
  files.push({ name: "xl/workbook.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map(function (s, i) { return '<sheet name="' + xmlEsc(s.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + "</sheets></workbook>" });
  files.push({ name: "xl/_rels/workbook.xml.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
  files.push({ name: "xl/styles.xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs></styleSheet>' });
  sheets.forEach(function (s, i) { files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", content: sheetXML(s.rows) }); });
  return zipStore(files);
}
