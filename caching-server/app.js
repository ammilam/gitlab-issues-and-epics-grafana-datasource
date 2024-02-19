const express = require('express');
const app = express();
const PORT = process.env.port || 8080;
const origin = process.env.origin || '*';
const https = require('https');
const fs = require('fs');
app.use(express.json());
const cors = require('cors')

const responseHeaders = {
  headers: {
    "Access-Control-Allow-Origin": "*", // Set the allowed origin to Grafana origin
    "Access-Control-Allow-Methods": 'GET,HEAD,PUT,PATCH,POST,DELETE',
    "Access-Control-Allow-Headers": 'Content-Type',
    "Access-Control-Max-Age": 86400 // Set the maximum age for preflight requests
  }
}

const corsOptions = {
  origin: origin, // Replace with your Grafana origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Adjust based on your needs
  allowedHeaders: ['Content-Type', 'Authorization'], // Adjust based on your needs
  credentials: true, // If your frontend needs to send credentials
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

const { startCron, writeFile } = require('./gitlab');

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err });
});

app.get('/gitlab', async (req, res) => {
  try {
    let query = req.query;

    if (!query.group) {
      res.status(400).json({ error: "web request missing 'group' query string" });
    }

    let group = query.group;

    console.log(`Getting data for group ${group}`);

    let groupData = `./data/${group}.json`;

    let data = fs.readFileSync(groupData);

    // buffer the data and base64 encode
    let buf = Buffer.from(data);
    let base64 = buf.toString('base64');
    res.set(responseHeaders.headers); // Set the headers using res.set()
    res.status(200).json({ data: base64 });

  } catch (error) {
    console.log(error);
    res.set(responseHeaders.headers); // Set the headers using res.set()
    res.status(500).json({ error: error.message });
  }
});

app.get('/issues', async (req, res) => {
  try {
    let query = req.query;

    if (!query.group) {
      res.status(400).json({ error: "web request missing 'group' query string" });
    }

    let group = query.group;

    console.log(`Getting data for group ${group}`);

    let groupData = `./data/${group}.json`;

    let data = fs.readFileSync(groupData);

    // buffer the data and base64 encode
    let buf = Buffer.from(data).toString();
    res.set(responseHeaders.headers); // Set the headers using res.set()
    res.status(200).json({ issues: JSON.parse(buf)['issues'] });

  } catch (error) {
    console.log(error);
    res.set(responseHeaders.headers); // Set the headers using res.set()
    res.status(500).json({ error: error.message });
  }
});

app.get('/epics', async (req, res) => {
  try {
    let query = req.query;

    if (!query.group) {
      res.status(400).json({ error: "web request missing 'group' query string" });
    }

    let group = query.group;

    console.log(`Getting data for group ${group}`);

    let groupData = `./data/${group}.json`;

    let data = fs.readFileSync(groupData);

    // buffer the data and base64 encode
    let buf = Buffer.from(data).toString();
    res.set(responseHeaders.headers); // Set the headers using res.set()

    res.status(200).json({ epics: JSON.parse(buf)['epics'] });

  } catch (error) {
    console.log(error);
    res.set(responseHeaders.headers); // Set the headers using res.set()
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', async (req, res) => {
  console.log(`serving request`)
  console.log(JSON.stringify(req))
  console.log(`sending response`)
  console.log(JSON.stringify(res))
  res.set(responseHeaders.headers); // Set the headers using res.set()
  res.status(200).json({ message: "ok" }, responseHeaders);
});


const certPath = process.env.certPath || './cert/tls.crt';
const keyPath = process.env.keyPath || './cert/tls.key';

const certsDetected = fs.existsSync(certPath) && fs.existsSync(keyPath);

if (certsDetected) {
  console.log(`cert found`)
  https.createServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  }, app)
    .listen(PORT, () => {
      writeFile();
      startCron();
      console.log(`Express server running on https://localhost:${PORT}`);
    });
} else {
  app.listen(PORT, () => {
    writeFile();
    startCron();
    console.log(`Proxy server running on http://localhost:${PORT}`);
  });
}
