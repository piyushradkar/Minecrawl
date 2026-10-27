const https = require('https');

exports.handler = async (event) => {
    const name = event.queryStringParameters.name || '';

    if (!name || name.trim().length < 3) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isProfane: false })
        };
    }

    const url = `https://api.purgomalum.com/v1/containsprofanity?text=${encodeURIComponent(name)}`;

    return new Promise((resolve) => {
        const req = https.get(url, { timeout: 4000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                const isProfane = data.trim() === 'true';
                resolve({
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({ isProfane: isProfane })
                });
            });
        });

        req.on('error', (err) => {
            console.error("PurgoMalum request error:", err);
            resolve({
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isProfane: false, error: true })
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isProfane: false, timeout: true })
            });
        });
    });
};
