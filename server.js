import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ─── Helper: Auth de Google (local) ───────────────────────
function getLocalDriveClient() {
    const credPath = path.join(__dirname, 'invoice-automation', 'credentials.json');
    const tokenPath = path.join(__dirname, 'invoice-automation', 'token.json');

    const keys = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    const key = keys.installed || keys.web;

    const oauth2Client = new google.auth.OAuth2(key.client_id, key.client_secret);
    oauth2Client.setCredentials(token);
    return google.drive({ version: 'v3', auth: oauth2Client });
}

// ─── Helper: Árbol de carpetas ─────────────────────────────
async function buildTree(drive, folderId, depth = 0) {
    const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, webViewLink, createdTime)',
        orderBy: 'name',
        pageSize: 200,
    });
    const children = res.data.files || [];
    const result = [];

    for (const child of children) {
        if (child.name === 'processed_ids.json') continue;
        if (child.mimeType === 'application/vnd.google-apps.folder' && depth < 3) {
            result.push({ id: child.id, name: child.name, type: 'folder', children: await buildTree(drive, child.id, depth + 1) });
        } else if (child.mimeType !== 'application/vnd.google-apps.folder') {
            result.push({ id: child.id, name: child.name, type: 'file', link: child.webViewLink, createdTime: child.createdTime });
        }
    }
    return result;
}

// ─── Endpoint: Google Drive file tree ─────────────────────
app.get('/api/drive-files', async (req, res) => {
    try {
        const BASE_FOLDER_ID = '1bj2CPwy32G_rBt5YPPXoFGUz3fiANIMw';
        const drive = getLocalDriveClient();
        const tree = await buildTree(drive, BASE_FOLDER_ID);
        res.json({ tree });
    } catch (error) {
        console.error('❌ Error en /api/drive-files:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─── Endpoint: Procesar facturas pendientes ───────────────
app.post('/api/process', async (req, res) => {
    try {
        console.log('🚀 Trigger manual de procesamiento recibido');

        const { authenticate } = await import('./invoice-automation/src/auth.js');
        const { createDriveService, getProcessedIdsFromDrive, listNewPDFs, downloadFile, ensureFolderStructure, moveAndRename, saveProcessedIdsToDrive } = await import('./invoice-automation/src/drive.js');
        const { createOpenAIClient, extractInvoiceData } = await import('./invoice-automation/src/openai.js');
        const { parsePeriodo, buildFileName } = await import('./invoice-automation/src/utils.js');

        const auth = await authenticate();
        const drive = createDriveService(auth);

        // Cargar variables de entorno si están en .env
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        const SOURCE_ID = '1_0An6lY_M97fKbeG_4B5Tf7z4p_YJ2_b';
        const BASE_ID = '1bj2CPwy32G_rBt5YPPXoFGUz3fiANIMw';

        const openai = createOpenAIClient(OPENAI_API_KEY);

        const { ids, fileId } = await getProcessedIdsFromDrive(drive, BASE_ID);
        const newFiles = await listNewPDFs(drive, SOURCE_ID, ids);

        let processed = 0;
        const batch = newFiles.slice(0, 5);

        for (const file of batch) {
            try {
                const pdf = await downloadFile(drive, file.id);
                const data = await extractInvoiceData(openai, pdf, file.name);
                const { año, mesNombre } = parsePeriodo(data.PERIODO_DE_ARRENDAMIENCE || data.PERIODO_DE_ARRENDAMIENTO);
                const newName = buildFileName(data.direccion, data.factura_numero, data.PERIODO_DE_ARRENDAMIENCE || data.PERIODO_DE_ARRENDAMIENTO);
                const destId = await ensureFolderStructure(drive, BASE_ID, año, data.direccion, mesNombre);
                await moveAndRename(drive, file.id, newName, destId, SOURCE_ID);
                ids.add(file.id);
                processed++;
            } catch (err) {
                console.error(`❌ Error en archivo ${file.name}:`, err.message);
            }
        }

        await saveProcessedIdsToDrive(drive, BASE_ID, ids, fileId);
        res.json({ processed, remaining: Math.max(0, newFiles.length - processed) });
    } catch (error) {
        console.error('❌ Error fatal procesando:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─── Endpoint: Crear factura (n8n) ────────────────────────
app.post('/api/create-invoice', async (req, res) => {
    const { apartment, refNumber, invNumber, period, transferDate } = req.body;
    console.log('📝 Recibida petición de factura:', { apartment, refNumber, invNumber, period, transferDate });

    const n8nWebhook = 'https://primary-production-7d4ca.up.railway.app/webhook/d8a04f04-3d84-4e8f-b64b-7c6d26e17e02';

    try {
        const response = await fetch(n8nWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apartment, refNumber, invNumber, period, transferDate }),
        });

        const data = await response.text();

        if (response.ok) {
            console.log('✅ Factura creada exitosamente');
            res.json({ success: true, message: '¡Factura generada con éxito! Revisa Telegram.', data });
        } else if (response.status === 404) {
            console.log('⚠️ n8n no disponible - MODO DEMO activado');
            res.json({ success: true, message: `✅ MODO DEMO: Factura simulada para ${apartment}.`, demo: true });
        } else {
            res.status(response.status).json({ success: false, message: `Error del servidor n8n: ${response.status}` });
        }
    } catch (error) {
        console.error('❌ Error al conectar con n8n:', error);
        res.status(500).json({ success: false, message: 'Error al conectar con el servidor de automatización', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor proxy corriendo en http://localhost:${PORT}`);
    console.log(`📡 Redirigiendo peticiones`);
});
