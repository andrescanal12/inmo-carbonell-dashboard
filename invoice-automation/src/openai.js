import OpenAI from 'openai';
import pdfParse from 'pdf-parse';

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
 * Inicializa el cliente de OpenAI.
 */
export function createOpenAIClient(apiKey) {
    if (!apiKey) {
        throw new Error('❌ OPENAI_API_KEY no configurada.');
    }
    return new OpenAI({ apiKey });
}

/**
 * Envía el texto de un PDF a OpenAI y extrae los datos de la factura.
 */
export async function extractInvoiceData(openai, pdfBuffer, fileName) {
    console.log(`   🤖 Enviando "${fileName}" a OpenAI (GPT-4o-mini)...`);

    try {
        // Extraer texto del PDF
        const pdfData = await pdfParse(pdfBuffer);
        const textContent = pdfData.text;

        if (!textContent || textContent.trim().length === 0) {
            throw new Error('No se pudo extraer texto del PDF (podría ser una imagen escaneada)');
        }

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `Aquí tienes el texto del PDF:\n\n${textContent}` }
            ],
            response_format: { type: 'json_object' }
        });

        const resultText = response.choices[0].message.content;
        return parseAIResponse(resultText, fileName);

    } catch (error) {
        throw new Error(`Error con OpenAI para "${fileName}": ${error.message}`);
    }
}

function parseAIResponse(text, fileName) {
    try {
        const data = JSON.parse(text);

        // Asegurar campos
        for (const campo of CAMPOS_REQUERIDOS) {
            if (data[campo] === undefined || data[campo] === null) {
                data[campo] = '';
            }
        }

        console.log(`   ✅ Datos extraídos correctamente con OpenAI de "${fileName}"`);
        return data;
    } catch (err) {
        throw new Error(`Error parseando JSON de OpenAI para "${fileName}": ${err.message}`);
    }
}
