"use strict";
var http = require('http'),
    httpProxy = require('http-proxy-caronte');

var proxy = httpProxy.createProxyServer({});
var winston = require('winston');
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ level: 'debug', timestamp: function() {
                var df = require('console-stamp/node_modules/dateformat');
                    return df(new Date(), 'HH:MM:ss.l');
                    }
                    }),
        new (winston.transports.File)({ level:'debug',filename: 'token_proxy.log', timestamp: function() {
                var df = require('console-stamp/node_modules/dateformat');
                    return df(new Date(), 'HH:MM:ss.l');
                    }
                    }),
        ]
});
String.prototype.startsWith = function(s) {
   return this.substring(0, s.length) === s;
}

if (process.argv.length != 4) {
  logger.info('Work-around proxy to issue a dummy delegation token for WebHDFS. Hortonworks, 2014.');
  logger.info('Usage: ' + process.argv[0] + ' ' + process.argv[1] + ' <port> <namenode http address>');
  logger.info('Example: ' + process.argv[0] + ' ' + process.argv[1] + ' 12345 http://localhost:50070');
  process.exit(-1);
}


var port = process.argv[2], proxyDest = process.argv[3]; 

var server = require('http').createServer(function(req, res) {
        logger.debug('Serving the URL ' + req.url);
        //for webhdfs
   if(req.url.indexOf('webhdfs')>-1){ 
        if (req.url.startsWith('/webhdfs/v1/?op=GETDELEGATIONTOKEN')) {
        logger.info('Issuing a dummy token for ' + req.socket.remoteAddress);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end('{"Token":{"urlString":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}}');
        } else if (req.url.startsWith('/webhdfs/v1/?op=CANCELDELEGATIONTOKEN')) {
        logger.info('Cancel dummy token for ' + req.socket.remoteAddress);
        res.end('');
        } else if (req.url.startsWith('/webhdfs/v1/?op=RENEWDELEGATIONTOKEN')) {
        logger.info('Renew token for ' + req.socket.remoteAddress);
        res.writeHead(200, {'Content-Type': 'application/json'});
        // 12-31-2037
        res.end('{"long":2145830400}');
        } else {
            proxy.web(req, res, { target: proxyDest });
        }
   }
   else{
        if (req.url.startsWith('/getDelegationToken')){
            //writeOut Token
            logger.info('Issuing a dummy token for ' + req.socket.remoteAddress);
            //1.Int, write tokenMapSize
            var buffer = new Buffer(1024);
            var offset =0;
            buffer.writeInt32BE(1,offset);
            offset+=4;
            //2.for key, value
            //key Text.write:  length, bytes
            buffer.writeInt32BE(8,offset);
            offset+=4;
            buffer.write('tokenKey',offset);
            offset+=8;
            //value Token.write:
            buffer.writeInt32BE(10,offset);
            offset+=4;
            buffer.write('identifier',offset)
                offset+=10;
            buffer.writeInt32BE(8,offset);
            offset+=4;
            buffer.write('password',offset);
            offset+=8;
            buffer.write('HFTPFS',offset);
            offset+=6;
            buffer.write('service',offset);
            //writeOut secretKeys
            //1. Int
            //2. for key,value
            offset+=7;
            buffer.writeInt32BE(0,offset);
            offset+=4;
            res.writeHead(200, {'Content-Type': 'application/octet-stream','Content-Length':offset});
            var sendBuffer = buffer.slice(0,offset);
            logger.debug('sendBufferLength=%d,offset = %d',sendBuffer.length,offset); 
            res.end(sendBuffer);
            logger.info('A dummy token issued for ' + req.socket.remoteAddress);
        } else if (req.url.startsWith('/cancelDelegationToken')){
            //TODO
            logger.info('Cancelling a dummy token issued for ' + req.socket.remoteAddress);
            // 1.get token from url
            var result = require('url').parse(req.url,true);
            // 2.rpc call nn cancel token
            // 3.null resp except expetion
            res.end('');
            logger.info('A dummy token cancelled,'+result);
        } else if (req.url.startsWith('/renewDelegationToken')){
            //TODO
            //1. get token from url
            logger.info('Renewing a dummy token issued for ' + req.socket.remoteAddress);
            var result = require('url').parse(req.url,true);
            //2. rpc call nn renew
            //3. println long
            res.end('2145830400'); 
            logger.info('A dummy token renewed,'+result);
        } else {
            proxy.web(req,res,{target:proxyDest});
        }
   }
});

logger.info('listening on ' + port);
server.listen(port);
