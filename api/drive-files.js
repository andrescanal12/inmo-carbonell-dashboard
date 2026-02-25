import { google } from 'googleapis';

// ─── Auth desde variables de entorno ─────────────────────
function getAuthClient() {
    const keys = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const token = JSON.parse(process.env.GOOGLE_TOKEN);
    const key = keys.installed || keys.web;

    const oauth2Client = new google.auth.OAuth2(
        key.client_id,
        key.client_secret,
        key.redirect_uris ? key.redirect_uris[0] : 'http://localhost:3333/callback'
    );
    oauth2Client.setCredentials(token);
    return oauth2Client;
}

// ─── Lista hijos de una carpeta ───────────────────────────
async function listChildren(drive, folderId) {
    const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, webViewLink, createdTime)',
        orderBy: 'name',
        pageSize: 200,
    });
    return res.data.files || [];
}

// ─── Construye el árbol completo ──────────────────────────
async function buildTree(drive, folderId, depth = 0) {
    const children = await listChildren(drive, folderId);
    const result = [];

    for (const child of children) {
        // Ignorar el archivo de estado interno
        if (child.name === 'processed_ids.json') continue;

        if (child.mimeType === 'application/vnd.google-apps.folder') {
            if (depth < 3) {
                const subTree = await buildTree(drive, child.id, depth + 1);
                result.push({
                    id: child.id,
                    name: child.name,
                    type: 'folder',
                    children: subTree,
                });
            }
        } else {
            result.push({
                id: child.id,
                name: child.name,
                type: 'file',
                link: child.webViewLink,
                createdTime: child.createdTime,
            });
        }
    }

    return result;
}

// ─── Handler principal ────────────────────────────────────
export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (!process.env.GOOGLE_CREDENTIALS || !process.env.GOOGLE_TOKEN) {
            throw new Error('Variables GOOGLE_CREDENTIALS / GOOGLE_TOKEN no configuradas');
        }

        const BASE_FOLDER_ID = process.env.DRIVE_BASE_FOLDER_ID;
        if (!BASE_FOLDER_ID) throw new Error('DRIVE_BASE_FOLDER_ID no configurado');

        const authClient = getAuthClient();
        const drive = google.drive({ version: 'v3', auth: authClient });

        const tree = await buildTree(drive, BASE_FOLDER_ID);

        // Cache 60 segundos para no sobrecargar la API de Drive
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
        return res.status(200).json({ tree });

    } catch (error) {
        console.error('Error en /api/drive-files:', error.message);
        return res.status(500).json({ error: error.message });
    }
}
