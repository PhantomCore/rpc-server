var request = require('request');
var async = require('async');
var phantomjs = require('phantomjscore');

var network = null,
  server = null;

var networks = {
  devnet: {
    name: "devnet",
    nethash: "e62ee59508e610421d7d39567cca36479397fa3c63b1d2e9458e08dee9eb6481",
    slip44: 1,
    version: 30,
    peers: [
      "texplorer.phantom.org:4100"
    ],
  },
  mainnet: {
    name: "mainnet",
    slip44: 111,
    nethash: "e62ee59508e610421d7d39567cca36479397fa3c63b1d2e9458e08dee9eb6481",
    version: 23,
    peers: [
      "texplorer.phantom.org:4100"
    ]
  }
};

function getFromNode(url, cb) {
  var nethash = network ? network.nethash : "";
  if (!url.startsWith("http")) {
    url = `http://${server}${url}`;
  }
  request(
    {
      url,
      headers: {
        nethash,
        version: '2.0.0',
        port: 1
      },
      timeout: 5000
    },
    function(error, response, body){
      if(error){
        server = network.peers[Math.floor(Math.random() * 1000) % network.peers.length];
      }
      cb(error, response, body);
    }
  );
}

function findEnabledPeers(cb) {
  var peers = [];
  getFromNode('/peer/list', function (err, response, body) {
    if (err || body == undefined) {
      cb(peers);
    }
    var respeers = JSON.parse(body).peers.
    filter(function (peer) {
      return peer.status == "OK";
    }).
    map(function (peer) {
      return `${peer.ip}:${peer.port}`;
    });
    async.each(respeers, function (peer, eachcb) {
      getFromNode(`http://${peer}/api/blocks/getHeight`, function (error, res, body2) {
        if (!error && body2 != "Forbidden") {
          peers.push(peer);
        }
        eachcb();
      });
    }, function (error) {
      if (error) return cb(error);

      return cb(peers);
    });

  });
}

function postTransaction(transaction, cb) {
  request(
    {
      url: `http://${server}/peer/transactions`,
      headers: {
        nethash: network.nethash,
        version: '1.0.0',
        port: 1
      },
      method: 'POST',
      json: true,
      body: {transactions: [transaction]}
    },
    cb
  );
}

function broadcast(transaction, callback) {
  network.peers.slice(0, 10).forEach(function (peer) {
    // Console.log("sending to", peer);
    request({
      url: `http://${peer}/peer/transactions`,
      headers: {
        nethash: network.nethash,
        version: '1.0.0',
        port: 1
      },
      method: 'POST',
      json: true,
      body: {transactions: [transaction]}
    });
  });
  callback();
}


function connect2network(netw, callback) {
  network = netw;
  server = netw.peers[Math.floor(Math.random() * 1000) % netw.peers.length];
  findEnabledPeers(function (peers) {
    if (peers.length > 0) {
      [server] = peers;
      netw.peers = peers;
    }
    callback();
  });
  getFromNode('/api/loader/autoconfigure', function (err, response, body) {
    if (err) return;
    if (!body || !body.startsWith("{"))
      connect2network(netw, callback);
    else {
      netw.config = JSON.parse(body).network;
    }
  });
}

function connect(req, res, next) {
  if (!server || !network || network.name != req.params.network) {
    if (networks[req.params.network]) {
      phantomjs.crypto.setNetworkVersion(networks[req.params.network].version);
      connect2network(networks[req.params.network], next);
    } else {
      res.send({
        success: false,
        error: `Could not find network ${req.params.network}`
      });
      res.end();
    }
  } else {
    next();
  }
}


module.exports = {
  broadcast,
  connect,
  getFromNode,
  postTransaction
};
