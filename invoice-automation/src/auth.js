import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');

const CREDENTIALS_PATH = path.join(ROOT_DIR, 'credentials.json');
const TOKEN_PATH = path.join(ROOT_DIR, 'token.json');

// Scopes necesarios para leer, mover y renombrar archivos en Drive
const SCOPES = ['https://www.googleapis.com/auth/drive'];

/**
 * Carga las credenciales OAuth2 desde el archivo credentials.json
 * y devuelve un cliente autenticado.
 */
export async function authenticate() {
    let keys;
    let token;

    // 1. Intentar cargar desde variables de entorno (Vercel)
    if (process.env.GOOGLE_CREDENTIALS) {
        keys = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } else if (fs.existsSync(CREDENTIALS_PATH)) {
        // Fallback local
        const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
        keys = JSON.parse(content);
    } else {
        throw new Error('❌ No se encontró credentials.json ni la variable GOOGLE_CREDENTIALS.');
    }

    const key = keys.installed || keys.web;
    const oauth2Client = new google.auth.OAuth2(
        key.client_id,
        key.client_secret,
        key.redirect_uris ? key.redirect_uris[0] : 'http://localhost:3333/callback'
    );

    // 2. Cargar Token
    if (process.env.GOOGLE_TOKEN) {
        token = JSON.parse(process.env.GOOGLE_TOKEN);
    } else if (fs.existsSync(TOKEN_PATH)) {
        token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    }

    if (token) {
        oauth2Client.setCredentials(token);

        // Refrescar si es necesario
        if (token.expiry_date && Date.now() >= token.expiry_date) {
            console.log('🔄 Token expirado, refrescando...');
            try {
                const { credentials } = await oauth2Client.refreshAccessToken();
                oauth2Client.setCredentials(credentials);

                // En local lo guardamos, en Vercel no podemos (pero el cliente ya lo tiene en memoria para esta ejecución)
                if (fs.existsSync(TOKEN_PATH)) {
                    fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials, null, 2));
                }
                console.log('✅ Token refrescado correctamente');
            } catch (err) {
                console.log('⚠️ No se pudo refrescar el token');
                if (process.env.VERCEL) throw new Error('Token expirado en producción. Por favor genera uno nuevo localmente.');
                return await getNewToken(oauth2Client);
            }
        }

        console.log('✅ Autenticado con éxito');
        return oauth2Client;
    }

    // 3. Fallback a flujo manual (solo local)
    if (process.env.VERCEL) throw new Error('No hay token configurado en Vercel.');
    return await getNewToken(oauth2Client);
}

/**
 * Inicia un servidor local temporal para capturar el código de autorización
 * de Google OAuth2.
 */
async function getNewToken(oauth2Client) {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });

    console.log('');
    console.log('=== AUTORIZACION DE GOOGLE DRIVE ===');
    console.log('');
    console.log('Abre esta URL en tu navegador:');
    console.log('');
    console.log(authUrl);
    console.log('');
    console.log('Esperando autorizacion...');
    console.log('');

    // Crear servidor temporal para capturar el callback
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            try {
                const url = new URL(req.url, 'http://localhost:3333');
                if (url.pathname !== '/callback') return;

                const code = url.searchParams.get('code');
                if (!code) {
                    res.writeHead(400);
                    res.end('No se recibio codigo de autorizacion');
                    return;
                }

                const { tokens } = await oauth2Client.getToken(code);
                oauth2Client.setCredentials(tokens);

                // Guardar token para futuras ejecuciones
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`
          <html><body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>Autorizacion completada!</h1>
            <p>Ya puedes cerrar esta pestana y volver a la terminal.</p>
          </body></html>
        `);

                console.log('Autorizacion completada! Token guardado en token.json');
                server.close();
                resolve(oauth2Client);
            } catch (err) {
                res.writeHead(500);
                res.end('Error durante la autorizacion');
                reject(err);
            }
        });

        server.listen(3333, () => {
            // Abrir navegador automaticamente en Windows
            import('child_process').then(({ exec }) => {
                if (process.platform === 'win32') {
                    exec(`start "" "${authUrl}"`);
                } else if (process.platform === 'darwin') {
                    exec(`open "${authUrl}"`);
                } else {
                    exec(`xdg-open "${authUrl}"`);
                }
            });
        });

        // Timeout de 5 minutos
        setTimeout(() => {
            server.close();
            reject(new Error('⏰ Timeout: No se recibió autorización en 5 minutos'));
        }, 300000);
    });
}

// Si se ejecuta directamente (npm run auth), solo autenticar
if (process.argv[1] && process.argv[1].includes('auth.js')) {
    authenticate()
        .then(() => {
            console.log('🎉 ¡Listo! Ya puedes ejecutar: npm start');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Error de autenticación:', err.message);
            process.exit(1);
        });
}
