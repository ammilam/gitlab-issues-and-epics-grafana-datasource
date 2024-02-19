const http = require('http');
const fs = require('fs');
const PORT = process.env.port || 8080;
const { startCron, writeFile } = require('./gitlab');

const server = http.createServer();

const responseHeaders = {
  "Access-Control-Allow-Origin": "*", // Set the allowed origin to Grafana origin
  "Access-Control-Allow-Methods": 'GET,HEAD,PUT,PATCH,POST,DELETE',
  "Access-Control-Allow-Headers": 'Content-Type',
  "Access-Control-Max-Age": 86400 // Set the maximum age for preflight requests
};
writeFile();
startCron();
server.on('request', (req, res) => {
  // Handle requests here
  if (req.url === '/gitlab') {
    try {
      let query = req.query;

      if (!query.group) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "web request missing 'group' query string" }));
        return;
      }

      let group = query.group;

      console.log(`Getting data for group ${group}`);

      let groupData = `./data/${group}.json`;

      let data = fs.readFileSync(groupData);

      // buffer the data and base64 encode
      let buf = Buffer.from(data);
      let base64 = buf.toString('base64');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: base64 }));

    } catch (error) {
      console.log(error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  } else if (req.url === '/issues') {
    try {
      let query = req.query;

      if (!query.group) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "web request missing 'group' query string" }));
        return;
      }

      let group = query.group;

      console.log(`Getting data for group ${group}`);

      let groupData = `./data/${group}.json`;

      let data = fs.readFileSync(groupData);

      // buffer the data and base64 encode
      let buf = Buffer.from(data).toString();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ issues: JSON.parse(buf)['issues'] }));

    } catch (error) {
      console.log(error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  } else if (req.url === '/epics') {
    try {
      let query = req.query;

      if (!query.group) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "web request missing 'group' query string" }));
        return;
      }

      let group = query.group;

      console.log(`Getting data for group ${group}`);

      let groupData = `./data/${group}.json`;

      let data = fs.readFileSync(groupData);

      // buffer the data and base64 encode
      let buf = Buffer.from(data).toString();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ epics: JSON.parse(buf)['epics'] }));

    } catch (error) {
      console.log(error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  } else if (req.url === '/health') {
    console.log(`serving request`)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: "ok" }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.on('error', (err) => {
  console.error(err);
});

server.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
