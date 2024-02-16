const express = require('express');
const app = express();
const PORT = process.env.port || 8080;
const origin = process.env.origin || '*';
const fs = require('fs');
app.use(express.json());
const { startCron, writeFile } = require('./gitlab');

const cors = require('cors');

const corsOptions = {
  origin: origin, // Allow requests from Grafana service DNS
  methods: "GET, HEAD, PUT, PATCH, POST, DELETE",
  'Access-Control-Allow-Origin': origin, // Allow CORS for Grafana service DNS
};

// Use CORS middleware
app.use(cors(corsOptions));

app.get('/gitlab', async (req, res) => {
  try {

    let query = req.query;

    if (!query.group) {
      res.status(400).json({ error: "web request missing 'group' query string" })
    }

    let group = query.group;

    console.log(`Getting data for group ${group}`)

    let groupData = `./data/${group}.json`;

    let data = fs.readFileSync(groupData);

    // buffer the data and base64 encode
    let buf = Buffer.from(data);
    let base64 = buf.toString('base64');

    res.status(200).json({ data: base64 });

  } catch (error) {
    console.log(error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/issues', async (req, res) => {

  try {
    let query = req.query;

    if (!query.group) {
      res.status(400).json({ error: "web request missing 'group' query string" })
    }

    let group = query.group;

    console.log(`Getting data for group ${group}`)

    let groupData = `./data/${group}.json`;

    let data = fs.readFileSync(groupData);

    // buffer the data and base64 encode
    let buf = Buffer.from(data).toString()

    res.status(200).json({ issues: JSON.parse(buf)['issues'] })

  } catch (error) {
    console.log(error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/epics', async (req, res) => {

  try {
    let query = req.query;

    if (!query.group) {
      res.status(400).json({ error: "web request missing 'group' query string" })
    }

    let group = query.group;

    console.log(`Getting data for group ${group}`)

    let groupData = `./data/${group}.json`;

    let data = fs.readFileSync(groupData);

    // buffer the data and base64 encode
    let buf = Buffer.from(data).toString()

    res.status(200).json({ epics: JSON.parse(buf)['epics'] })

  } catch (error) {
    console.log(error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/health', async (req, res) => {
  console.log('health check')
  res.status(200).json({ message: "ok" })
})

app.listen(PORT, () => {
  writeFile()
  startCron()
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
