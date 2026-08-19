import jsPDF from 'jspdf';

interface EntradaHistoria {
  id: string;
  fecha: string;
  comentario_evolucion: string;
  comentarios_extras: string | null;
  variables_json: Record<string, string> | null;
  ficha_modelo?: { nombre: string } | null;
  profesional: { nombre: string; apellido: string };
}

interface PacienteInfo {
  nombre: string;
  apellido: string;
  dni: string;
}

export function exportarHistoriaPDF(paciente: PacienteInfo, entradas: EntradaHistoria[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const lineH = 6;
  let y = margin;

  const addLine = (text: string, size = 10, bold = false) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(text, pageW - margin * 2) as string[];
    for (const line of lines) {
      if (y > 270) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += lineH;
    }
  };

  doc.setFillColor(8, 14, 26);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('VITALIS — Historia Clínica', margin, 14);
  doc.setTextColor(0, 0, 0);
  y = 30;

  addLine(`Paciente: ${paciente.nombre} ${paciente.apellido}`, 12, true);
  addLine(`DNI: ${paciente.dni}`, 10);
  addLine(`Generado: ${new Date().toLocaleDateString('es-AR')}`, 9);
  y += 4;

  for (const entrada of entradas) {
    if (y > 260) { doc.addPage(); y = margin; }
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageW - margin, y);
    y += 5;

    addLine(`${entrada.fecha} — ${entrada.profesional.nombre} ${entrada.profesional.apellido}`, 10, true);
    if (entrada.ficha_modelo?.nombre) addLine(`Ficha: ${entrada.ficha_modelo.nombre}`, 9);
    if (entrada.comentario_evolucion) addLine(entrada.comentario_evolucion, 10);
    if (entrada.comentarios_extras) addLine(`Notas: ${entrada.comentarios_extras}`, 9);
    if (entrada.variables_json) {
      for (const [k, v] of Object.entries(entrada.variables_json)) {
        addLine(`  ${k}: ${v}`, 9);
      }
    }
    y += 4;
  }

  doc.save(`historia-${paciente.apellido}-${paciente.dni}.pdf`);
}
