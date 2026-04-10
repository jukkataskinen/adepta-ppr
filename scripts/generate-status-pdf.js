const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const root = path.resolve(__dirname, '..');
const inputPath = path.join(root, 'PROJECT_STATUS_SAAS_GAP_2026-04-10.md');
const outputPath = path.join(root, 'PROJECT_STATUS_SAAS_GAP_2026-04-10.pdf');

const content = fs.readFileSync(inputPath, 'utf8');
const lines = content.split(/\r?\n/);

const doc = new PDFDocument({ size: 'A4', margin: 48 });
const out = fs.createWriteStream(outputPath);
doc.pipe(out);

doc.font('Helvetica');

for (const rawLine of lines) {
  const line = rawLine || ' ';
  if (line.startsWith('# ')) {
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(16).text(line.replace(/^#\s*/, ''), { align: 'left' });
    doc.font('Helvetica').fontSize(11);
    doc.moveDown(0.2);
    continue;
  }
  if (line.startsWith('## ')) {
    doc.moveDown(0.35);
    doc.font('Helvetica-Bold').fontSize(13).text(line.replace(/^##\s*/, ''), { align: 'left' });
    doc.font('Helvetica').fontSize(11);
    doc.moveDown(0.15);
    continue;
  }
  if (line.startsWith('### ')) {
    doc.moveDown(0.25);
    doc.font('Helvetica-Bold').fontSize(11.5).text(line.replace(/^###\s*/, ''), { align: 'left' });
    doc.font('Helvetica').fontSize(11);
    continue;
  }
  if (line.startsWith('- ')) {
    doc.font('Helvetica').fontSize(11).text(`• ${line.slice(2)}`, { align: 'left' });
    continue;
  }
  doc.font('Helvetica').fontSize(11).text(line, { align: 'left' });
}

doc.end();

out.on('finish', () => {
  // eslint-disable-next-line no-console
  console.log(`PDF created: ${outputPath}`);
});

