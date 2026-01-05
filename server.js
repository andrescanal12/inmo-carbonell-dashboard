import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Configuración de CORS para permitir peticiones desde el frontend
app.use(cors());
app.use(express.json());

// Endpoint proxy para n8n
app.post('/api/create-invoice', async (req, res) => {
    const { apartment, refNumber, invNumber, period } = req.body;

    console.log('📝 Recibida petición de factura:', { apartment, refNumber, invNumber, period });

    const n8nWebhook = 'https://primary-production-7d4ca.up.railway.app/webhook/d8a04f04-3d84-4e8f-b64b-7c6d26e17e02';

    try {
        const response = await fetch(n8nWebhook, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                apartment,
                refNumber,
                invNumber,
                period
            }),
        });

        const data = await response.text();

        if (response.ok) {
            console.log('✅ Factura creada exitosamente');
            res.json({
                success: true,
                message: '¡Factura generada con éxito! Revisa Telegram.',
                data
            });
        } else if (response.status === 404) {
            // MODO DEMO: n8n no está activo, simular éxito
            console.log('⚠️ n8n no disponible - MODO DEMO activado');
            console.log('📋 Datos que se enviarían:', { apartment, refNumber, invNumber, period });
            res.json({
                success: true,
                message: `✅ MODO DEMO: Factura simulada para ${apartment}. Activa n8n para funcionamiento real.`,
                demo: true,
                data: { apartment, refNumber, invNumber, period }
            });
        } else {
            console.error('❌ Error del webhook n8n:', response.status, data);
            res.status(response.status).json({
                success: false,
                message: `Error del servidor n8n: ${response.status}`,
                error: data
            });
        }
    } catch (error) {
        console.error('❌ Error al conectar con n8n:', error);
        res.status(500).json({
            success: false,
            message: 'Error al conectar con el servidor de automatización',
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor proxy corriendo en http://localhost:${PORT}`);
    console.log(`📡 Redirigiendo peticiones a n8n webhook`);
});
