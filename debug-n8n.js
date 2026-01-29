
const n8nWebhook = 'https://primary-production-7d4ca.up.railway.app/webhook/d8a04f04-3d84-4e8f-b64b-7c6d26e17e02';

async function test() {
    const payload = {
        apartment: "TEST",
        refNumber: "1",
        invNumber: "1",
        period: "JANUARY"
    };

    console.log('Testing with payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(n8nWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Response body:', text);
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

test();
