import { GoogleGenerativeAI } from '@google/generative-ai';

// Campos que debe extraer la IA de cada factura
const CAMPOS_REQUERIDOS = [
    'arrendadora_nombre', 'arrendadora_nie',
    'inquilino1_nombre', 'inquilino1_nie',
    'inquilino2_nombre', 'inquilino2_nie',
    'direccion', 'cp', 'ciudad',
    'factura_numero', 'fecha_emision', 'importe_pago', 'fecha_pago',
    'banco', 'iban',
    'agencia_nombre', 'agencia_telefono', 'agencia_email', 'agencia_web',
    'referencia', 'observaciones',
    'PERIODO_DE_ARRENDAMIENTO',
];

const today = new Date().toISOString().split('T')[0];

const SYSTEM_PROMPT = `Extrae estos campos EXACTOS y en este ORDEN.
Devuelve SOLO un objeto JSON válido con esas claves. Sin texto adicional.

REGLAS:
- Fechas: formato YYYY-MM-DD. Si no hay fecha de emisión, usa ${today}.
- Importe: solo números (sin “€” ni separadores de miles). Si no hay dato, deja "".
- Si falta cualquier campo, deja "" (cadena vacía).
- No inventes datos.

SALIDA (JSON con estas claves):
{
  "arrendadora_nombre": "",
  "arrendadora_nie": "",
  "inquilino1_nombre": "",
  "inquilino1_nie": "",
  "inquilino2_nombre": "",
  "inquilino2_nie": "",
  "direccion": "",
  "cp": "",
  "ciudad": "",
  "factura_numero": "",
  "fecha_emision": "",
  "importe_pago": "",
  "fecha_pago": "",
  "banco": "",
  "iban": "",
  "agencia_nombre": "",
  "agencia_telefono": "",
  "agencia_email": "",
  "agencia_web": "",
  "referencia": "",
  "observaciones": "",
  "PERIODO_DE_ARRENDAMIENTO": ""
}`;

/**
 * Inicializa el cliente de Gemini AI.
 */
export function createGeminiClient(apiKey) {
    if (!apiKey) {
        throw new Error(
            '❌ GEMINI_API_KEY no configurada.\n' +
            '   Obtén tu API key en: https://aistudio.google.com/apikey\n' +
            '   Añádela al archivo .env'
        );
    }
    return new GoogleGenerativeAI(apiKey);
}

/**
 * Envía un PDF a Gemini AI y extrae los datos de la factura.
 * 
 * @param {GoogleGenerativeAI} genAI - Cliente de Gemini
 * @param {Buffer} pdfBuffer - Contenido del PDF como Buffer
 * @param {string} fileName - Nombre del archivo (para logs)
 * @returns {Object} Datos extraídos de la factura
 */
export async function extractInvoiceData(genAI, pdfBuffer, fileName) {
    console.log(`   🤖 Enviando "${fileName}" a Gemini AI...`);

    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    // Enviar PDF como input multimodal (base64)
    const pdfBase64 = pdfBuffer.toString('base64');

    try {
        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: 'application/pdf',
                    data: pdfBase64,
                },
            },
            { text: SYSTEM_PROMPT },
        ]);

        const response = result.response;
        const text = response.text();

        // Parsear el JSON devuelto
        const data = parseGeminiResponse(text, fileName);
        return data;

    } catch (error) {
        // Si el multimodal falla, intentar con pdf-parse como fallback
        console.log(`   ⚠️ Gemini multimodal falló para "${fileName}", intentando con extracción de texto...`);
        return await extractWithTextFallback(genAI, pdfBuffer, fileName);
    }
}

/**
 * Fallback: Extraer texto del PDF con pdf-parse y enviarlo como texto a Gemini.
 */
async function extractWithTextFallback(genAI, pdfBuffer, fileName) {
    try {
        // Importar pdf-parse dinámicamente
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(pdfBuffer);

        if (!pdfData.text || pdfData.text.trim().length === 0) {
            throw new Error('El PDF no contiene texto extraíble (podría ser una imagen escaneada)');
        }

        console.log(`   📝 Texto extraído del PDF (${pdfData.text.length} caracteres)`);

        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
        const result = await model.generateContent([
            { text: `Aquí tienes el texto extraído de una factura de alquiler:\n\n${pdfData.text}` },
            { text: SYSTEM_PROMPT },
        ]);

        const text = result.response.text();
        return parseGeminiResponse(text, fileName);

    } catch (error) {
        throw new Error(`No se pudo procesar "${fileName}": ${error.message}`);
    }
}

/**
 * Parsea y valida la respuesta JSON de Gemini.
 */
function parseGeminiResponse(text, fileName) {
    // Limpiar la respuesta: quitar posibles marcadores de código
    let cleanText = text.trim();

    // Quitar ```json ... ``` si viene envuelto
    if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
        const data = JSON.parse(cleanText);

        // Validar que tenga los campos mínimos necesarios
        if (!data.PERIODO_DE_ARRENDAMIENTO) {
            console.log(`   ⚠️ Advertencia: PERIODO_DE_ARRENDAMIENTO está vacío para "${fileName}"`);
        }
        if (!data.direccion) {
            console.log(`   ⚠️ Advertencia: dirección está vacía para "${fileName}"`);
        }
        if (!data.factura_numero) {
            console.log(`   ⚠️ Advertencia: factura_numero está vacío para "${fileName}"`);
        }

        // Asegurar que todos los campos existan (con cadena vacía si faltan)
        for (const campo of CAMPOS_REQUERIDOS) {
            if (data[campo] === undefined || data[campo] === null) {
                data[campo] = '';
            }
        }

        console.log(`   ✅ Datos extraídos correctamente de "${fileName}"`);
        return data;

    } catch (parseError) {
        throw new Error(
            `No se pudo parsear la respuesta de Gemini para "${fileName}".\n` +
            `   Respuesta recibida: ${cleanText.substring(0, 200)}...`
        );
    }
}
