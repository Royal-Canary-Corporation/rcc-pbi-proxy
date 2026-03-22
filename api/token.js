const https = require('https');
const querystring = require('querystring');

const TENANT_ID     = process.env.TENANT_ID;
const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const WORKSPACE_ID  = process.env.WORKSPACE_ID;
const REPORT_ID     = process.env.REPORT_ID;

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // Step 1: AAD token
    const tokenBody = querystring.stringify({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope:         'https://analysis.windows.net/powerbi/api/.default',
    });

    const tokenRes = await httpsPost(
      'login.microsoftonline.com',
      `/${TENANT_ID}/oauth2/v2.0/token`,
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(tokenBody),
      },
      tokenBody
    );

    if (tokenRes.status !== 200) {
      return res.status(502).json({ error: 'AAD token failed', detail: tokenRes.body });
    }

    const accessToken = tokenRes.body.access_token;

    // Step 2: Power BI embed token
    const embedBody = JSON.stringify({ accessLevel: 'View' });
    const embedRes = await httpsPost(
      'api.powerbi.com',
      `/v1.0/myorg/groups/${WORKSPACE_ID}/reports/${REPORT_ID}/GenerateToken`,
      {
        'Authorization':  `Bearer ${accessToken}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(embedBody),
      },
      embedBody
    );

    if (embedRes.status !== 200) {
      return res.status(502).json({ error: 'Embed token failed', httpStatus: embedRes.status, detail: embedRes.body });
    }

    return res.status(200).json({
      embedToken:  embedRes.body.token,
      tokenExpiry: embedRes.body.expiration,
      reportId:    REPORT_ID,
      workspaceId: WORKSPACE_ID,
      embedUrl:    `https://app.powerbi.com/reportEmbed?reportId=${REPORT_ID}&groupId=${WORKSPACE_ID}`,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
