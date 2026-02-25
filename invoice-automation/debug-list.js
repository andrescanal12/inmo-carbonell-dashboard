import 'dotenv/config';
import { authenticate } from './src/auth.js';
import { createDriveService } from './src/drive.js';

async function listAll() {
    const authClient = await authenticate();
    const drive = createDriveService(authClient);
    const folderId = process.env.DRIVE_SOURCE_FOLDER_ID;

    console.log(`Buscando en carpeta: ${folderId}`);

    const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType)',
    });

    if (res.data.files.length === 0) {
        console.log('No se encontraron archivos.');
    } else {
        res.data.files.forEach(f => {
            console.log(`- [${f.mimeType}] ${f.name} (ID: ${f.id})`);
        });
    }
}

listAll().catch(console.error);
