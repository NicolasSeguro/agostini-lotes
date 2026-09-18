/**
 * Convierte un buffer DOCX a buffer PDF usando LibreOffice headless.
 * Requiere LibreOffice instalado en el server.
 * 
 * Estrategia:
 *  1. Guardar el buffer en un archivo temporal único
 *  2. Ejecutar soffice --headless --convert-to pdf
 *  3. Leer el PDF resultante
 *  4. Limpiar archivos temporales
 */
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";

// Ruta del ejecutable de LibreOffice. Configurable por env var.
const SOFFICE_PATH = process.env.LIBREOFFICE_PATH || "C:\\Program Files\\LibreOffice\\program\\soffice.exe";

const TIMEOUT_MS = 60_000;  // 60s máximo por conversión

export async function convertirDocxAPdf(docxBuffer: Buffer): Promise<Buffer> {
  // Carpeta temporal única para esta conversión
  const tempDir = join(tmpdir(), `boleto-${randomUUID()}`);
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }

  const docxPath = join(tempDir, "input.docx");
  const pdfPath = join(tempDir, "input.pdf");

  try {
    // 1. Escribir el .docx
    await writeFile(docxPath, docxBuffer);

    // 2. Ejecutar LibreOffice
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(SOFFICE_PATH, [
        "--headless",
        "--norestore",
        "--nolockcheck",
        "--nodefault",
        "--nofirststartwizard",
        "--convert-to", "pdf",
        "--outdir", tempDir,
        docxPath,
      ], { windowsHide: true });

      let stderr = "";
      let stdout = "";
      proc.stdout?.on("data", (d) => { stdout += d.toString(); });
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      const to = setTimeout(() => {
        proc.kill();
        reject(new Error(`Timeout (${TIMEOUT_MS}ms) convirtiendo a PDF. ¿LibreOffice está instalado en ${SOFFICE_PATH}?`));
      }, TIMEOUT_MS);

      proc.on("error", (err: any) => {
        clearTimeout(to);
        if (err.code === "ENOENT") {
          reject(new Error(`LibreOffice no encontrado en ${SOFFICE_PATH}. Instalalo o configurá LIBREOFFICE_PATH en .env.local`));
        } else {
          reject(err);
        }
      });

      proc.on("close", (code) => {
        clearTimeout(to);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`LibreOffice falló (exit ${code}). stderr: ${stderr || "(vacío)"} stdout: ${stdout || "(vacío)"}`));
        }
      });
    });

    // 3. Leer el PDF
    if (!existsSync(pdfPath)) {
      throw new Error("LibreOffice ejecutó OK pero no generó el PDF (archivo no encontrado)");
    }
    const pdf = await readFile(pdfPath);
    return pdf;
  } finally {
    // 4. Limpieza (no rompe si falla, los temps los limpia el SO igual)
    try { await unlink(docxPath); } catch {}
    try { await unlink(pdfPath); } catch {}
  }
}
