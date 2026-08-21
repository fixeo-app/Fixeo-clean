module.exports = async function handler(req, res) {
  // Meta webhook verification
  if (req.method === 'GET') {
    const url = new URL(
      req.url,
      https://${req.headers.host || 'www.fixeo.ma'}
    );

    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (!verifyToken) {
      return res.status(500).send('Webhook verify token not configured');
    }

    if (mode === 'subscribe' && token === verifyToken) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    }

    return res.status(403).send('Forbidden');
  }

  // Receive WhatsApp webhook events.
  // No business processing yet: acknowledge only.
  if (req.method === 'POST') {
    return res.status(200).send('EVENT_RECEIVED');
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).send('Method Not Allowed');
};
