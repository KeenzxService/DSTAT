const http = require("http");
const fs = require("fs");
const WebSocket = require("ws");
const cluster = require("cluster");
const os = require("os");

const cpus = os.cpus().length;
const port = 8080;
const index = fs.readFileSync("./index.html");

if (cluster.isMaster) {
  console.log(`Number of CPUs is ${cpus}`);
  console.log(`Master ${process.pid} is running`);

  let requests = 0;
  let childs = [];
  for (let i = 0; i < cpus; i++) {
    let child = cluster.fork();

    // Listen for message from worker
    child.on("message", (msg) => {
      if (msg === 'increment') {
        requests++;
      }
    });

    // Listen for worker exit to respawn if necessary
    child.on('exit', (code, signal) => {
      if (code !== 0) {
        console.error(`Worker ${child.process.pid} exited with code ${code}`);
      }
    });

    childs.push(child);
  }

  setInterval(() => {
    // Send requests count to workers
    for (let child of childs) {
      if (child.isConnected()) {
        child.send(requests);
      }
    }
    requests = 0;
  }, 1000);
} else {
  console.log(`Worker ${process.pid} started`);

  const handler = function (req, res) {
    if (req.url == "/count") {
      process.send('increment'); // Notify master to increment request count
      res.end();
    } else {
      res.end(index);
    }
  };

  const server = http.createServer(handler);
  const wss = new WebSocket.Server({ server });

  process.on("message", (requests) => {
    console.log(`Worker ${process.pid} received requests: ${requests}`);
    // Send the number of requests to all WebSocket clients
    wss.clients.forEach((client) => client.send(requests));
  });

  // Handle worker errors
  process.on('error', (err) => {
    console.error(`Error in worker ${process.pid}:`, err);
  });

  server.listen(port, () => {
    console.log(`Worker ${process.pid} is listening on port ${port}`);
  });
}
