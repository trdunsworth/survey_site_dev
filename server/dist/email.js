import nodemailer from 'nodemailer';
function createTransport() {
    const host = process.env.SMTP_HOST;
    const portRaw = process.env.SMTP_PORT ?? '587';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
        return null;
    }
    const port = Number(portRaw);
    if (!Number.isFinite(port) || port <= 0) {
        return null;
    }
    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });
}
export async function sendResumeTokenEmail(to, token, resumeUrl, expiresAt) {
    const transporter = createTransport();
    const fromAddress = process.env.SMTP_FROM;
    if (!transporter || !fromAddress) {
        return { sent: false, error: 'Email sending is not configured on this server.' };
    }
    const expiresDate = new Date(expiresAt);
    const expiresLabel = Number.isNaN(expiresDate.getTime())
        ? expiresAt
        : expiresDate.toLocaleString();
    const subject = 'Your NENA Survey Save Code (valid for 7 days)';
    const text = [
        'You requested a save code for your NENA survey.',
        '',
        'This code is valid for 7 days and can only be used once.',
        `Save code: ${token}`,
        `Resume link: ${resumeUrl}`,
        `Expires: ${expiresLabel}`,
        '',
        'If you did not request this message, you can safely ignore it.',
    ].join('\n');
    try {
        await transporter.sendMail({
            from: fromAddress,
            to,
            subject,
            text,
        });
        return { sent: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown email send error';
        return { sent: false, error: message };
    }
}
