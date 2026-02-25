import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { authenticate } from './auth.js';
import { createDriveService, listNewPDFs, downloadFile, ensureFolderStructure, moveAndRename } from './drive.js';
import { createOpenAIClient, extractInvoiceData } from './openai.js';
import { parsePeriodo, buildFileName, timestamp } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PROCESSED_IDS_PATH = path.join(ROOT_DIR, 'processed_ids.json');

// ─── Configuración ────────────────────────────────────────
const SOURCE_FOLDER_ID = process.env.DRIVE_SOURCE_FOLDER_ID;
const BASE_FOLDER_ID = process.env.DRIVE_BASE_FOLDER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL_MS || '120000', 10);
const RUN_ONCE = process.argv.includes('--once');

// ─── Estado ───────────────────────────────────────────────
let processedIds = loadProcessedIds();

function loadProcessedIds() {
    try {
        if (fs.existsSync(PROCESSED_IDS_PATH)) {
            const data = JSON.parse(fs.readFileSync(PROCESSED_IDS_PATH, 'utf-8'));
            return new Set(data);
        }
    } catch {
        console.log('⚠️ No se pudo leer processed_ids.json, empezando de cero');
    }
    return new Set();
}

function saveProcessedIds() {
    fs.writeFileSync(PROCESSED_IDS_PATH, JSON.stringify([...processedIds], null, 2));
}

// ─── Validación de configuración ──────────────────────────
function validateConfig() {
    const errors = [];
    if (!SOURCE_FOLDER_ID) errors.push('DRIVE_SOURCE_FOLDER_ID no configurado en .env');
    if (!BASE_FOLDER_ID) errors.push('DRIVE_BASE_FOLDER_ID no configurado en .env');
    if (!OPENAI_API_KEY) errors.push('OPENAI_API_KEY no configurado en .env');

    if (errors.length > 0) {
        console.error('\n❌ ════════════════════════════════════════════════');
        console.error('   CONFIGURACIÓN INCOMPLETA');
        console.error('════════════════════════════════════════════════\n');
        errors.forEach(e => console.error(`   • ${e}`));
        console.error('\n   Copia .env.example a .env y rellena los valores.\n');
        process.exit(1);
    }
}

// ─── Procesamiento de una factura individual ──────────────
async function processInvoice(drive, aiClient, file, retryCount = 0) {
    const { id, name } = file;
    const MAX_RETRIES = 2;

    console.log(`\n📄 ──────────────────────────────────────────────`);
    console.log(`   Procesando: "${name}"`);
    console.log(`   ID: ${id}`);
    console.log(`──────────────────────────────────────────────────`);

    try {
        // 1. Descargar el PDF
        console.log(`   📥 Descargando PDF...`);
        const pdfBuffer = await downloadFile(drive, id);
        console.log(`   📥 Descargado: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

        // 2. Enviar a OpenAI para extraer datos
        const data = await extractInvoiceData(aiClient, pdfBuffer, name);

        // 3. Parsear el periodo para obtener año y mes
        const { año, mesNombre } = parsePeriodo(data.PERIODO_DE_ARRENDAMIENTO);
        console.log(`   📅 Periodo: ${data.PERIODO_DE_ARRENDAMIENTO} → Año: ${año}, Mes: ${mesNombre}`);

        // 4. Generar el nuevo nombre del archivo
        const newFileName = buildFileName(data.direccion, data.factura_numero, data.PERIODO_DE_ARRENDAMIENTO);
        console.log(`   📝 Nuevo nombre: "${newFileName}"`);

        // 5. Asegurar estructura de carpetas: Base → Año → Dirección → Mes
        const direccionCarpeta = data.direccion?.trim() || 'Sin Dirección';
        const destFolderId = await ensureFolderStructure(drive, BASE_FOLDER_ID, año, direccionCarpeta, mesNombre);

        // 6. Mover y renombrar el archivo
        await moveAndRename(drive, id, newFileName, destFolderId, SOURCE_FOLDER_ID);

        // 7. Marcar como procesado
        processedIds.add(id);
        saveProcessedIds();

        console.log(`   ✅ ¡Factura procesada con éxito!`);
        console.log(`   📋 Datos extraídos:`);
        console.log(`      • Arrendadora: ${data.arrendadora_nombre || '—'}`);
        console.log(`      • Inquilino: ${data.inquilino1_nombre || '—'}`);
        console.log(`      • Dirección: ${data.direccion || '—'}`);
        console.log(`      • Factura: ${data.factura_numero || '—'}`);
        console.log(`      • Importe: ${data.importe_pago || '—'} €`);
        console.log(`      • Periodo: ${data.PERIODO_DE_ARRENDAMIENTO || '—'}`);

        return { success: true, data, newFileName };

    } catch (error) {
        // Manejo específico de cuota/rate limit (error 429)
        if (error.message.includes('429') || error.message.includes('Rate limit')) {
            if (retryCount < MAX_RETRIES) {
                const delay = 10000 * (retryCount + 1);
                console.log(`   ⚠️ Límite de OpenAI alcanzado. Reintentando en ${delay / 1000}s... (Intento ${retryCount + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return processInvoice(drive, aiClient, file, retryCount + 1);
            } else {
                console.error(`   ❌ Falló por límite de cuota tras ${MAX_RETRIES} reintentos.`);
                return { success: false, error: 'Límite de cuota excedido', isRateLimit: true };
            }
        }

        console.error(`\n   ❌ Error procesando "${name}":`);
        console.error(`      ${error.message}`);

        processedIds.add(id);
        saveProcessedIds();

        return { success: false, error: error.message };
    }
}

// ─── Ciclo de polling ────────────────────────────────────
async function pollCycle(drive, aiClient) {
    console.log(`\n⏱️  [${timestamp()}] Revisando carpeta de facturas...`);

    try {
        const newFiles = await listNewPDFs(drive, SOURCE_FOLDER_ID, processedIds);

        if (newFiles.length === 0) {
            console.log('   📭 No hay facturas nuevas');
            return;
        }

        console.log(`   📬 ¡${newFiles.length} factura(s) nueva(s) encontrada(s)!`);

        let successCount = 0;
        let errorCount = 0;

        for (const file of newFiles) {
            const result = await processInvoice(drive, aiClient, file);
            if (result.success) successCount++;
            else errorCount++;
        }

        console.log(`\n📊 Resumen: ${successCount} procesadas, ${errorCount} errores`);

    } catch (error) {
        console.error(`\n❌ Error en el ciclo de polling: ${error.message}`);
    }
}

// ─── Main ────────────────────────────────────────────────
async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║   🏠 AUTOMATIZACIÓN DE FACTURAS DE ALQUILER         ║');
    console.log('║   Google Drive + OpenAI (GPT-4o-mini)               ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');

    // Validar configuración
    validateConfig();

    // Autenticar con Google
    console.log('🔐 Autenticando con Google Drive...');
    const authClient = await authenticate();
    const drive = createDriveService(authClient);

    // Inicializar OpenAI
    console.log('🤖 Inicializando OpenAI...');
    const aiClient = createOpenAIClient(OPENAI_API_KEY);

    console.log(`📁 Carpeta origen: ${SOURCE_FOLDER_ID}`);
    console.log(`📁 Carpeta destino: ${BASE_FOLDER_ID}`);
    console.log(`📦 IDs ya procesados: ${processedIds.size}`);

    if (RUN_ONCE) {
        // Modo --once: ejecutar una vez y salir
        console.log('\n🔄 Modo: Ejecución única (--once)');
        await pollCycle(drive, aiClient);
        console.log('\n✅ Ejecución completada');
    } else {
        // Modo polling: ejecutar continuamente
        console.log(`\n🔄 Modo: Polling cada ${POLLING_INTERVAL / 1000} segundos`);
        console.log('   (Presiona Ctrl+C para detener)\n');

        // Ejecutar inmediatamente la primera vez
        await pollCycle(drive, aiClient);

        // Luego cada X milisegundos
        setInterval(() => pollCycle(drive, aiClient), POLLING_INTERVAL);
    }
}

main().catch(error => {
    console.error('\n💀 Error fatal:', error.message);
    process.exit(1);
});
