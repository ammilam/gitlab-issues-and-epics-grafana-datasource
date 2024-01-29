const express = require('express');
const app = express();
const PORT = 8080; // You can choose any available port
const cors = require('cors');

const corsOptions = {
  "origin": "*",
  "methods": "GET, HEAD, PUT, PATCH, POST, DELETE",
  'Access-Control-Allow-Origin': '*'
}

// Use CORS middleware
app.use(cors(corsOptions));
app.use(express.json());


// Proxy endpoint
app.post('/graphql-proxy', async (req, res) => {
  const apiUrl = req.headers['x-api-url'];
  const authorization = req.headers.authorization;
  const body = req.body
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json(); // Use .json() if the response is JSON
    // Sending back the response from GitLab API to the client
    res.send(data);
  } catch (error) {
    // console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
