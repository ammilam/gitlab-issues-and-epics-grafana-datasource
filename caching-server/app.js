const express = require('express');
const app = express();
const PORT = process.env.port || 8443;
const origin = process.env.origin || '*';
const https = require('https');
const fs = require('fs');
app.use(express.json());
const cors = require('cors')

app.use(
  cors({
    origin: `http://localhost:${PORT}`,
    // Allow follow-up middleware to override this CORS for options
    preflightContinue: true,
  }),
);

const { startCron, writeFile } = require('./gitlab');

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', 'davita.com')
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
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

    res.status(200).json({ data: base64 });

  } catch (error) {
    console.log(error);
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

    res.status(200).json({ issues: JSON.parse(buf)['issues'] });

  } catch (error) {
    console.log(error);
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

    res.status(200).json({ epics: JSON.parse(buf)['epics'] });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', async (_, res) => {
  console.log('health check');
  res.status(200).json({ message: "ok" });
});


const certPath = process.env.certPath || './gldc.crt';
const keyPath = process.env.keyPath || './gldc.key';

const certsDetected = fs.existsSync(certPath) && fs.existsSync(keyPath);

if (certsDetected) {
  https.createServer({
    key: fs.readFileSync(keyPath), // Path to your key file
    cert: fs.readFileSync(certPath) // Path to your certificate file
  }, app)
    .listen(PORT, function () {
      console.log(`Express server running on https://localhost:${PORT}`);
    });
} else {
  app.listen(PORT, () => {
    writeFile();
    startCron();
    console.log(`Proxy server running on http://localhost:${PORT}`);
  });  
}

