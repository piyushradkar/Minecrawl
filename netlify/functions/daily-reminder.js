const { schedule } = require('@netlify/functions');
const nodemailer = require('nodemailer');

const handler = async function(event, context) {
    console.log("Daily email reminder cron triggered.");

    // Retrieve environment variables
    const supabaseUrl = process.env.SUPABASE_URL || 'https://ebcauizpkjfoesdjddnb.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const smtpHost = process.env.SMTP_HOST || 'smtpout.secureserver.net';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    // Check basic parameters
    if (!supabaseKey) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Cannot fetch subscribers.");
        return { statusCode: 500, body: "Missing Supabase API key" };
    }
    if (!smtpUser || !smtpPass) {
        console.error("Missing SMTP_USER or SMTP_PASS environment variables. Cannot send mail.");
        return { statusCode: 500, body: "Missing SMTP credentials" };
    }

    try {
        // 1. Fetch active subscribers from Supabase using native node-fetch (bypasses RLS using Service Role Key)
        console.log("Fetching subscribers list from Supabase...");
        const response = await fetch(`${supabaseUrl}/rest/v1/subscribers?select=email`, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Supabase API query failed: ${response.statusText}. Details: ${errorText}`);
        }

        const data = await response.json();
        const emailList = data.map(row => row.email).filter(Boolean);

        console.log(`Successfully fetched ${emailList.length} subscribers.`);
        if (emailList.length === 0) {
            console.log("No active subscribers to mail.");
            return { statusCode: 200, body: "Zero subscribers" };
        }

        // 2. Set up Nodemailer transport using GoDaddy credentials
        console.log(`Connecting to GoDaddy SMTP server: ${smtpHost}:${smtpPort}...`);
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465, // true for port 465, false for 587
            auth: {
                user: smtpUser,
                pass: smtpPass
            },
            tls: {
                // Do not fail on invalid certs
                rejectUnauthorized: false
            }
        });

        // Test the connection
        await transporter.verify();
        console.log("SMTP connection verified successfully.");

        // 3. Define the styled HTML body content
        const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {
                    font-family: 'Outfit', Arial, sans-serif;
                    background-color: #020617;
                    color: #f8fafc;
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #0f172a;
                    border: 1px solid rgba(251, 191, 36, 0.25);
                    border-radius: 16px;
                    padding: 35px;
                    box-shadow: 0 15px 45px rgba(0,0,0,0.6);
                }
                .logo {
                    display: block;
                    width: 90px;
                    height: 90px;
                    margin: 0 auto 15px auto;
                }
                h1 {
                    font-size: 24px;
                    font-weight: 800;
                    color: #fbbf24;
                    text-align: center;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    margin-bottom: 25px;
                }
                p {
                    font-size: 15px;
                    line-height: 1.6;
                    color: #cbd5e1;
                    margin-bottom: 20px;
                }
                .btn-container {
                    text-align: center;
                    margin: 35px 0;
                }
                .btn {
                    display: inline-block;
                    background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%);
                    color: #020617;
                    padding: 15px 30px;
                    font-size: 16px;
                    font-weight: 800;
                    text-decoration: none;
                    border-radius: 8px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    box-shadow: 0 8px 25px rgba(245, 158, 11, 0.35);
                }
                .footer {
                    text-align: center;
                    font-size: 12px;
                    color: #64748b;
                    margin-top: 35px;
                    border-top: 1px solid rgba(255,255,255,0.06);
                    padding-top: 20px;
                    line-height: 1.5;
                }
                .footer a {
                    color: #fbbf24;
                    text-decoration: underline;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <img class="logo" src="https://minecrawl.com/logo.png" alt="MineCrawl Logo" />
                <h1>New Deposit Discovered! ⛏️</h1>
                <p>Attention operator,</p>
                <p>Check out today's discovery and see if you can top today's leaderboard.</p>
                <div class="btn-container">
                    <a href="https://minecrawl.netlify.app/" class="btn">Launch Operations</a>
                </div>
                <div class="footer">
                    You are receiving this daily transmission because you subscribed to MineCrawl alerts.<br>
                    To unsubscribe from these alerts, simply reply to this email with "Unsubscribe" in the subject line.
                </div>
            </div>
        </body>
        </html>
        `;

        // 4. Send emails in batches of 80 (to avoid exceeding typical SMTP server recipient limits)
        const batchSize = 80;
        let emailsSent = 0;

        for (let i = 0; i < emailList.length; i += batchSize) {
            const batch = emailList.slice(i, i + batchSize);
            console.log(`Sending batch ${Math.floor(i / batchSize) + 1} (${batch.length} recipients) via BCC...`);

            await transporter.sendMail({
                from: `"MineCrawl Daily Challenge" <${smtpUser}>`,
                to: smtpUser, // Send to yourself
                bcc: batch,    // Hide other addresses using BCC
                subject: "MineCrawl: New Deposit Discovered! ⛏️",
                html: htmlBody
            });

            emailsSent += batch.length;
        }

        console.log(`All alerts sent successfully! Total recipients: ${emailsSent}`);
        return {
            statusCode: 200,
            body: `Sent daily reminder successfully to ${emailsSent} subscribers.`
        };

    } catch (err) {
        console.error("Critical error in daily email reminder cron job:", err);
        return {
            statusCode: 500,
            body: `Error: ${err.message}`
        };
    }
};

// 0 2 * * * triggers at 2:00 AM UTC (which matches exactly 10:00 AM Perth time)
exports.handler = schedule("0 2 * * *", handler);
