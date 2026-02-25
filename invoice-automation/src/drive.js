import { google } from 'googleapis';
import { Readable } from 'stream';

/**
 * Crea una instancia del servicio de Google Drive.
 */
export function createDriveService(authClient) {
    return google.drive({ version: 'v3', auth: authClient });
}

/**
 * Lista los archivos PDF nuevos en una carpeta de Drive.
 * Devuelve solo los que no están en la lista de IDs ya procesados.
 */
export async function listNewPDFs(drive, folderId, processedIds = new Set()) {
    try {
        const res = await drive.files.list({
            q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
            fields: 'files(id, name, createdTime, modifiedTime)',
            orderBy: 'createdTime desc',
            pageSize: 50,
        });

        const allFiles = res.data.files || [];
        const newFiles = allFiles.filter(f => !processedIds.has(f.id));

        return newFiles;
    } catch (error) {
        if (error.code === 404) {
            throw new Error(
                `❌ Carpeta no encontrada (ID: ${folderId}).\n` +
                `   Verifica el DRIVE_SOURCE_FOLDER_ID en tu archivo .env`
            );
        }
        throw error;
    }
}

/**
 * Descarga el contenido de un archivo de Drive como Buffer.
 */
export async function downloadFile(drive, fileId) {
    const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
    );
    return Buffer.from(res.data);
}

/**
 * Busca una carpeta por nombre dentro de un padre.
 * Devuelve el ID de la carpeta si existe, null si no.
 */
export async function findFolder(drive, name, parentId) {
    const res = await drive.files.list({
        q: `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1,
    });

    return res.data.files?.[0]?.id || null;
}

/**
 * Crea una carpeta en Drive dentro de un padre.
 * Devuelve el ID de la nueva carpeta.
 */
export async function createFolder(drive, name, parentId) {
    const res = await drive.files.create({
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        },
        fields: 'id',
    });

    console.log(`   📁 Carpeta creada: "${name}"`);
    return res.data.id;
}

/**
 * Asegura que exista la estructura de carpetas:
 * Carpeta Base → Año → Dirección → Mes
 * 
 * Crea las carpetas que falten y devuelve el ID de la carpeta del Mes.
 */
export async function ensureFolderStructure(drive, baseFolderId, año, direccion, mes) {
    console.log(`   📂 Verificando estructura: ${año} → ${direccion} → ${mes}`);

    // Carpeta del Año
    let yearFolderId = await findFolder(drive, año, baseFolderId);
    if (!yearFolderId) {
        yearFolderId = await createFolder(drive, año, baseFolderId);
    }

    // Carpeta de la Dirección (dentro del Año)
    let addressFolderId = await findFolder(drive, direccion, yearFolderId);
    if (!addressFolderId) {
        addressFolderId = await createFolder(drive, direccion, yearFolderId);
    }

    // Carpeta del Mes (dentro de la Dirección)
    let monthFolderId = await findFolder(drive, mes, addressFolderId);
    if (!monthFolderId) {
        monthFolderId = await createFolder(drive, mes, addressFolderId);
    }

    return monthFolderId;
}

/**
 * Mueve un archivo a una carpeta destino y lo renombra.
 * - Elimina el archivo de la carpeta de origen
 * - Lo añade a la carpeta destino
 * - Le cambia el nombre
 */
export async function moveAndRename(drive, fileId, newName, destFolderId, sourceFolderId) {
    await drive.files.update({
        fileId,
        addParents: destFolderId,
        removeParents: sourceFolderId,
        requestBody: {
            name: newName,
        },
        fields: 'id, name, parents',
    });

    console.log(`   📄 Archivo movido y renombrado: "${newName}"`);
}

/**
 * Lee el archivo processed_ids.json desde una carpeta específica de Google Drive.
 */
export async function getProcessedIdsFromDrive(drive, baseFolderId) {
    try {
        const res = await drive.files.list({
            q: `'${baseFolderId}' in parents and name='processed_ids.json' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1,
        });

        const files = res.data.files;
        if (files && files.length > 0) {
            const content = await downloadFile(drive, files[0].id);
            const data = JSON.parse(content.toString('utf-8'));
            return { ids: new Set(data), fileId: files[0].id };
        }
    } catch (error) {
        console.log('   ⚠️ No se pudo leer el estado desde Drive, empezando de cero.');
    }
    return { ids: new Set(), fileId: null };
}

/**
 * Guarda el archivo processed_ids.json en Google Drive.
 */
export async function saveProcessedIdsToDrive(drive, baseFolderId, ids, existingFileId = null) {
    const content = JSON.stringify([...ids], null, 2);

    // Configuración para el "archivo" virtual de memoria
    const media = {
        mimeType: 'application/json',
        body: content,
    };

    if (existingFileId) {
        // Actualizar archivo existente
        await drive.files.update({
            fileId: existingFileId,
            media: media,
        });
    } else {
        // Crear nuevo archivo
        await drive.files.create({
            requestBody: {
                name: 'processed_ids.json',
                parents: [baseFolderId],
            },
            media: media,
        });
    }
}
