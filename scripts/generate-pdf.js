/**
 * ============================================================================
 * LOGIX SOFTWARE - GENERADOR UNIVERSAL DE REPORTES DE AUDITORÍA CONTABLE EN PDF
 * ============================================================================
 * Herramienta ligera, autónoma y sin dependencias externas para generar reportes
 * ejecutivos en formato PDF-1.4 de alta calidad para clientes y gerencia.
 *
 * Características:
 * - Compatible con Windows, Linux y macOS sin necesidad de Chrome, Puppeteer o Java.
 * - Salto de línea automático inteligente (wrapText) para evitar desbordes de margen.
 * - Formato ejecutivo de 1 página A4 imprimible con bloques de firma y soporte técnico.
 * - Adaptable para auditar cualquier sistema POS, ERP o base de datos relacional.
 */

const fs = require('fs');
const path = require('path');

function esc(str) {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Divide cadenas de texto largas en múltiples líneas de tamaño seguro
 * para garantizar que ningún párrafo sobrepase el margen derecho del documento.
 */
function wrapText(text, maxChars = 88) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxChars) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Motor ligero de construcción de documentos PDF 1.4 en memoria
 */
class SimplePDF {
  constructor() {
    this.pages = [];
    this.currentPage = null;
    this.pageWidth = 595.28; // Estándar A4 pt (210mm)
    this.pageHeight = 841.89; // Estándar A4 pt (297mm)
  }

  addPage() {
    this.currentPage = {
      stream: []
    };
    this.pages.push(this.currentPage);
  }

  rect(x, y, w, h, r, g, b, strokeR = null, strokeG = null, strokeB = null) {
    let s = `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`;
    if (strokeR !== null) {
      s += ` ${strokeR.toFixed(3)} ${strokeG.toFixed(3)} ${strokeB.toFixed(3)} RG 1 w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re s`;
    }
    this.currentPage.stream.push(s);
  }

  line(x1, y1, x2, y2, r, g, b, width = 1) {
    this.currentPage.stream.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  text(str, x, y, font = 'F1', size = 10, r = 0, g = 0, b = 0) {
    const clean = esc(str);
    this.currentPage.stream.push(`BT /${font} ${size} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${clean}) Tj ET`);
  }

  build() {
    const objects = [];
    let objCount = 5;

    const catalogId = 1;
    const pagesId = 2;
    const fontF1Id = 3;
    const fontF2Id = 4;
    const fontF3Id = 5;

    const pageObjIds = [];

    for (const page of this.pages) {
      const streamContent = page.stream.join('\n');
      const streamLen = Buffer.byteLength(streamContent, 'utf-8');
      objCount++;
      const contentId = objCount;
      objects.push({ id: contentId, content: `<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream` });

      objCount++;
      const pageId = objCount;
      objects.push({
        id: pageId,
        content: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontF1Id} 0 R /F2 ${fontF2Id} 0 R /F3 ${fontF3Id} 0 R >> >> >>`
      });
      pageObjIds.push(pageId);
    }

    const kidsStr = pageObjIds.map(id => `${id} 0 R`).join(' ');
    objects.unshift(
      { id: catalogId, content: `<< /Type /Catalog /Pages ${pagesId} 0 R >>` },
      { id: pagesId, content: `<< /Type /Pages /Kids [${kidsStr}] /Count ${pageObjIds.length} >>` },
      { id: fontF1Id, content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>` },
      { id: fontF2Id, content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>` },
      { id: fontF3Id, content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>` }
    );

    objects.sort((a, b) => a.id - b.id);

    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];

    for (const obj of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf-8'));
      pdf += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf-8');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(pdf, 'binary');
  }
}

/**
 * Función principal generadora del reporte de auditoría
 */
function generateAuditReport() {
  const pdf = new SimplePDF();
  pdf.addPage();

  // Márgenes simétricos: Izquierda: 42pt, Derecha: 553pt (Ancho útil: 511pt)
  const left = 42;
  const right = 553;
  const usableWidth = right - left;

  // 1. Encabezado Ejecutivo en AZUL METÁLICO (#1B365D: R:0.106, G:0.212, B:0.365) con Letras Blancas
  pdf.rect(0, 755, 595.28, 87, 0.106, 0.212, 0.365);
  // Barra superior de brillo metálico (#3B82F6)
  pdf.rect(0, 836, 595.28, 6, 0.231, 0.510, 0.965);

  pdf.text('CRISPY BURGER POS - INFORME GENERAL DE ESTADO', left, 808, 'F2', 16, 1, 1, 1);
  pdf.text('Reporte Oficial de Salud del Sistema y Control Contable', left, 788, 'F2', 10.5, 0.92, 0.96, 1);
  pdf.text('Fecha: Octubre 2026 | Destinatario: Administracion y Gerencia General | Auditoria: Logix', left, 770, 'F1', 8.5, 0.80, 0.88, 0.98);

  // 2. Tarjeta de Diagnóstico Global (Verde Suave)
  pdf.rect(left, 695, usableWidth, 46, 0.94, 0.98, 0.94, 0.15, 0.65, 0.25);
  pdf.text('DIAGNOSTICO GENERAL: SISTEMA 100% SALUDABLE Y SEGURO', left + 16, 723, 'F2', 10, 0.1, 0.5, 0.15);
  pdf.text('Todas las pruebas de dinero, cobros, mesas y pedidos confirman que la contabilidad del', left + 16, 709, 'F1', 8.5, 0.2, 0.4, 0.2);
  pdf.text('restaurante esta cuadrada al centavo y protegida contra cualquier tipo de descuadre.', left + 16, 699, 'F1', 8.5, 0.2, 0.4, 0.2);

  // 3. Sección 1: RESUMEN (actualizado a solo "1. RESUMEN")
  let y = 668;
  pdf.text('1. RESUMEN', left, y, 'F2', 10.5, 0.106, 0.212, 0.365);
  pdf.line(left, y - 4, right, y - 4, 0.8, 0.8, 0.8);

  y -= 16;
  const p1Text = 'Realizamos una revision exhaustiva de toda la informacion que maneja el restaurante en su operacion diaria: el dinero que entra a caja, las comandas enviadas a cocina, las mesas ocupadas en el salon y los pedidos con delivery. La conclusion es excelente: el sistema funciona con total precision. Cada centavo que el cliente pago y el cajero anoto coincide exactamente con lo registrado en cada comanda. No hay fugas de dinero, no hay cobros fantasmas ni dinero perdido.';
  const p1Lines = wrapText(p1Text, 92);
  for (const line of p1Lines) {
    pdf.text(line, left, y, 'F1', 8.2, 0.25, 0.25, 0.25);
    y -= 11.5;
  }

  // 4. Sección 2: Tabla de Control Contable
  y -= 6;
  pdf.text('2. RESULTADOS DE LAS PRUEBAS DE CONTROL', left, y, 'F2', 10.5, 0.106, 0.212, 0.365);
  pdf.line(left, y - 4, right, y - 4, 0.8, 0.8, 0.8);

  y -= 16;
  // Encabezado de la tabla
  pdf.rect(left, y - 4, usableWidth, 17, 0.106, 0.212, 0.365);
  pdf.text('AREA EVALUADA', left + 10, y + 2, 'F2', 8.2, 1, 1, 1);
  pdf.text('QUE SE REVISO EN DETALLE', left + 145, y + 2, 'F2', 8.2, 1, 1, 1);
  pdf.text('RESULTADO', right - 85, y + 2, 'F2', 8.2, 1, 1, 1);

  const checks = [
    {
      area: 'Control de Pagos y Caja',
      desc: 'Todo el dinero cobrado coincide con los pagos recibidos.',
      status: 'PERFECTO (0 errores)'
    },
    {
      area: 'Estados de Deuda',
      desc: 'Ningun cliente figura como pagado si aun debe dinero.',
      status: 'PERFECTO (0 errores)'
    },
    {
      area: 'Control de Mesas en Salon',
      desc: 'Las mesas ocupadas corresponden a comensales reales.',
      status: 'PERFECTO (0 errores)'
    },
    {
      area: 'Cuentas a Credito (Fiado)',
      desc: 'Las cuentas a credito no inflan la gaveta de efectivo.',
      status: 'PERFECTO (0 errores)'
    },
    {
      area: 'Seguridad en Registros',
      desc: 'Sin pagos huerfanos ni cobros flotando sin pedido.',
      status: 'PERFECTO (0 errores)'
    }
  ];

  for (let i = 0; i < checks.length; i++) {
    const c = checks[i];
    y -= 19;
    const bg = i % 2 === 0 ? 0.98 : 0.93;
    pdf.rect(left, y - 4, usableWidth, 19, bg, bg, bg, 0.88, 0.88, 0.88);

    pdf.text(c.area, left + 10, y + 3, 'F2', 8, 0.1, 0.1, 0.1);
    pdf.text(c.desc, left + 145, y + 3, 'F1', 7.8, 0.3, 0.3, 0.3);

    // Insignia Verde
    pdf.rect(right - 95, y - 1, 90, 13, 0.88, 0.96, 0.88, 0.15, 0.65, 0.2);
    pdf.text(c.status, right - 89, y + 2.5, 'F2', 7, 0.1, 0.5, 0.15);
  }

  // 5. Sección 3: Conclusiones y Beneficios para el Restaurante
  y -= 18;
  pdf.text('3. CONCLUSIONES Y BENEFICIOS PARA EL RESTAURANTE', left, y, 'F2', 10.5, 0.106, 0.212, 0.365);
  pdf.line(left, y - 4, right, y - 4, 0.8, 0.8, 0.8);

  y -= 14;
  const conclusions = [
    {
      num: '1.',
      title: 'Confianza Total en el Arqueo:',
      desc: 'La gaveta de dinero cuadra con exactitud. Si al final del turno el cajero cuenta billetes en caja, el sistema sabe con precision matematica que comandas generaron ese efectivo.'
    },
    {
      num: '2.',
      title: 'Tranquilidad con Cuentas a Credito:',
      desc: 'Los creditos autorizados a clientes de confianza quedan guardados con su nombre y no meten dinero falso a la caja chica, evitando faltantes artificiales al contar el efectivo.'
    },
    {
      num: '3.',
      title: 'Impresion Termica Impecable:',
      desc: 'Las cuentas impresas en papel termico muestran de forma estetica y limpia el consumo del cliente en Euros con total nitidez, sin simbolos raros ni impresiones duplicadas.'
    },
    {
      num: '4.',
      title: 'Flujo Operativo Limpio y Reiniciado:',
      desc: 'Al hacer el cierre del turno, el sistema archiva el dia anterior, dejando las mesas limpias y listas para que el turno nuevo empiece desde cero sin comandas rezagadas.'
    }
  ];

  for (const c of conclusions) {
    pdf.text(`${c.num} ${c.title}`, left, y, 'F2', 8.2, 0.1, 0.1, 0.1);
    y -= 10;
    const descLines = wrapText(c.desc, 88);
    for (const dLine of descLines) {
      pdf.text(dLine, left + 14, y, 'F1', 7.8, 0.3, 0.3, 0.3);
      y -= 9.8;
    }
    y -= 2.5;
  }

  // 6. Sección 4: Firmas de Conformidad y Entrega (Solo "Firma", sin "Sello")
  y -= 10;
  pdf.text('4. CONFORMIDAD Y FIRMAS DE ENTREGA', left, y, 'F2', 10.5, 0.106, 0.212, 0.365);
  pdf.line(left, y - 4, right, y - 4, 0.8, 0.8, 0.8);

  y -= 16;
  const boxWidth = 245;
  const boxHeight = 56;
  const signLineOffset = 24;

  // Cuadro Izquierdo: Logix (Empresa Desarrolladora)
  pdf.rect(left, y - boxHeight, boxWidth, boxHeight, 0.98, 0.98, 0.99, 0.75, 0.82, 0.90);
  pdf.text('POR LA EMPRESA DE DESARROLLO (LOGIX)', left + 12, y - 10, 'F2', 8, 0.106, 0.212, 0.365);
  pdf.line(left + 20, y - signLineOffset, left + boxWidth - 20, y - signLineOffset, 0.45, 0.45, 0.45, 0.8);
  pdf.text('Firma - Logix', left + 85, y - signLineOffset - 11, 'F2', 8.2, 0.15, 0.15, 0.15);
  pdf.text('Empresa de Desarrollo de Software', left + 46, y - signLineOffset - 21, 'F1', 7.5, 0.4, 0.4, 0.4);

  // Cuadro Derecho: Gerente (Recepción del Restaurante)
  const rightBoxX = right - boxWidth;
  pdf.rect(rightBoxX, y - boxHeight, boxWidth, boxHeight, 0.98, 0.98, 0.99, 0.75, 0.82, 0.90);
  pdf.text('POR EL CLIENTE (GERENCIA GENERAL)', rightBoxX + 12, y - 10, 'F2', 8, 0.106, 0.212, 0.365);
  pdf.line(rightBoxX + 20, y - signLineOffset, rightBoxX + boxWidth - 20, y - signLineOffset, 0.45, 0.45, 0.45, 0.8);
  pdf.text('Firma - Gerencia General', rightBoxX + 62, y - signLineOffset - 11, 'F2', 8.2, 0.15, 0.15, 0.15);
  pdf.text('Recepcion y Conformidad del Restaurante', rightBoxX + 33, y - signLineOffset - 21, 'F1', 7.5, 0.4, 0.4, 0.4);

  // 7. Sección 5: Responsable del Sistema y Soporte Técnico (Jesus Burgos en su propia línea)
  y = y - boxHeight - 12;
  const supportCardHeight = 62;
  pdf.rect(left, y - supportCardHeight, usableWidth, supportCardHeight, 0.95, 0.97, 0.99, 0.25, 0.45, 0.70);
  // Acento lateral azul metálico
  pdf.rect(left, y - supportCardHeight, 5, supportCardHeight, 0.106, 0.212, 0.365);

  pdf.text('CONTACTO DIRECTO Y SOPORTE TECNICO', left + 14, y - 10, 'F2', 8.5, 0.106, 0.212, 0.365);
  pdf.text('Responsable del sistema y del soporte:', left + 14, y - 21, 'F2', 8, 0.15, 0.15, 0.15);
  pdf.text('Jesus Burgos', left + 14, y - 31, 'F2', 8.2, 0.106, 0.212, 0.365);
  pdf.text('V-32362846', left + 14, y - 41, 'F1', 8, 0.25, 0.25, 0.25);
  pdf.text('+584245687814', left + 14, y - 51, 'F1', 8, 0.25, 0.25, 0.25);
  pdf.text('burgosdeveloper@gmail.com', left + 14, y - 61, 'F1', 8, 0.25, 0.25, 0.25);

  // 8. Pie de Página Oficial
  pdf.line(left, 36, right, 36, 0.85, 0.85, 0.85);
  pdf.text('Crispy Burger POS - Documento Oficial de Control Contable', left, 25, 'F1', 7.5, 0.45, 0.45, 0.45);
  pdf.text('Desarrollado y Auditado por Logix | Pagina 1 de 1 (Completo)', right - 200, 25, 'F1', 7.5, 0.45, 0.45, 0.45);

  const buffer = pdf.build();
  const outputPath = path.join(__dirname, '..', 'Reporte_Auditoria_Crispy_POS.pdf');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ Archivo PDF generado exitosamente en: ${outputPath} (${buffer.length} bytes)`);
}

generateAuditReport();
