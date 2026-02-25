import { authenticate } from '../src/auth.js';
import { createDriveService, listNewPDFs, getProcessedIdsFromDrive, saveProcessedIdsToDrive, downloadFile, ensureFolderStructure, moveAndRename } from '../src/drive.js';
import { createOpenAIClient, extractInvoiceData } from '../src/openai.js';
import { parsePeriodo, buildFileName } from '../src/utils.js';

export default async function handler(req, res) {
    // 1. Verificación simple de seguridad (opcional, pero recomendada)
    // Puedes añadir una variable CRON_SECRET en Vercel y verificarla
    // if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return res.status(401).json({ error: 'Unauthorized' });
    // }

    console.log('🚀 Iniciando proceso de facturas (Vercel Serverless)');

    try {
        // IDs de carpetas desde variables de entorno
        const SOURCE_FOLDER_ID = process.env.DRIVE_SOURCE_FOLDER_ID;
        const BASE_FOLDER_ID = process.env.DRIVE_BASE_FOLDER_ID;
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

        if (!SOURCE_FOLDER_ID || !BASE_FOLDER_ID || !OPENAI_API_KEY) {
            throw new Error('Variables de entorno (DRIVE_SOURCE_FOLDER_ID, DRIVE_BASE_FOLDER_ID, OPENAI_API_KEY) no configuradas.');
        }

        // 2. Autenticación
        const authClient = await authenticate();
        const drive = createDriveService(authClient);
        const openai = createOpenAIClient(OPENAI_API_KEY);

        // 3. Obtener estado desde Drive
        console.log('📂 Leyendo estado de Drive...');
        const { ids: processedIds, fileId: stateFileId } = await getProcessedIdsFromDrive(drive, BASE_FOLDER_ID);
        console.log(`📦 IDs ya procesados: ${processedIds.size}`);

        // 4. Listar nuevas facturas
        const newFiles = await listNewPDFs(drive, SOURCE_FOLDER_ID, processedIds);

        if (newFiles.length === 0) {
            console.log('📭 No hay facturas nuevas');
            return res.status(200).json({ message: 'No common invoices found' });
        }

        console.log(`📬 ${newFiles.length} factura(s) nueva(s) encontrada(s)`);

        // 5. Procesar (limitamos a 5 para no exceder los 10-60s de Vercel)
        const batch = newFiles.slice(0, 5);
        let successCount = 0;

        for (const file of batch) {
            try {
                const { id, name } = file;
                console.log(`📄 Procesando: ${name}`);

                const pdfBuffer = await downloadFile(drive, id);
                const data = await extractInvoiceData(openai, pdfBuffer, name);
                const { año, mesNombre } = parsePeriodo(data.PERIODO_DE_ARRENDAMIENTO);
                const newFileName = buildFileName(data.direccion, data.factura_numero, data.PERIODO_DE_ARRENDAMIENTO);

                const direccionCarpeta = data.direccion?.trim() || 'Sin Dirección';
                const destFolderId = await ensureFolderStructure(drive, BASE_FOLDER_ID, año, direccionCarpeta, mesNombre);

                await moveAndRename(drive, id, newFileName, destFolderId, SOURCE_FOLDER_ID);

                processedIds.add(id);
                successCount++;
            } catch (err) {
                console.error(`❌ Error en archivo ${file.name}: ${err.message}`);
                // No lo marcamos como procesado para que el siguiente cron lo intente
            }
        }

        // 6. Guardar estado de vuelta en Drive
        console.log('💾 Guardando nuevo estado en Drive...');
        await saveProcessedIdsToDrive(drive, BASE_FOLDER_ID, processedIds, stateFileId);

        return res.status(200).json({
            processed: successCount,
            remaining: Math.max(0, newFiles.length - batch.length),
            message: 'Batch completed'
        });

    } catch (error) {
        console.error('💀 Error fatal:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
