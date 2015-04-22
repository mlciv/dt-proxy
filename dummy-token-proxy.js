"use strict";
var http = require('http'),
    httpProxy = require('http-proxy');
var lineReader = require('line-reader');
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
var host_ip_dict = {};
lineReader.eachLine('SourceDataNodeHosts', function(line, last) {
  var reg = /[\s|\t]+/;
  var splits = line.split(reg);
  if (splits.length == 2){
      logger.info("splitsLenth = "+splits.length+" loaded:" + splits);
      host_ip_dict[splits[1]]=splits[0];
  }else{
      logger.info("line is invalid: "+ line);
  }
});

// Listen for error event
proxy.on('error', function(err,req,res) { 
  // retry 
  logger.error("proxy emit request["+req.url+"] failed:"+ err);
});

// Listen for proxyRes event, replace hostname to IP
proxy.on('proxyRes', function (proxyRes, req, res) {
  logger.debug('RAW Response from the target', JSON.stringify(proxyRes.headers, true, 2));
  var location = proxyRes.headers["location"];
  if(location!=null)
  {
  	var reg = /https?:\/\/.*?[:|\/]/;
  	var hostname_str = location.match(reg);
  	if(hostname_str==null) logger.error("find no pattern of hostname");
  	var hostname = "";
  	if(hostname_str[0].startsWith('https://')){
  		hostname = 	hostname_str[0].substring(8,hostname_str[0].length-1);
  	}
  	else if(hostname_str[0].startsWith('http://')){
  		hostname = 	hostname_str[0].substring(7,hostname_str[0].length-1);
  	}
  	var ipreg=/\d+\.\d+\.\d+\.\d+/;
        //if hostname is not a ip, replace it with host_ip_dict
  	if(!ipreg.test(hostname)){
  		var reg1 = hostname;
  		var new_location = proxyRes.headers["location"].replace(hostname,host_ip_dict[hostname]); // replace the first one by default
  		proxyRes.headers["location"] = new_location;
  		logger.debug('replace hostname['+hostname+'] with ip['+host_ip_dict[hostname]+']: ', JSON.stringify(proxyRes.headers, true, 2));
  	}
  }
});

var server = require('http').createServer(function(req, res) {
        logger.debug('Serving the URL ' + req.url);
	logger.debug('RAW_Headers'+require('util').inspect(req.headers, {depth:null}));
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
            //1.Int, write tokenMapSize writeVLong for -112<= size <=127, write just one byte 
            var buffer = new Buffer(1024);
            var offset =0;
	    // size = 1, only write 1 byte
            buffer.writeInt8(1,offset);
            offset+=1;
            //2.for key, value
            //key Text.write:  length, bytes
            buffer.writeInt8(8,offset);
            offset+=1;
            buffer.write('tokenKey',offset);
            offset+=8;

            //value Token.write:
            //write length of identity
            buffer.writeInt8(10,offset);
            offset+=1;
	    //write identity bytes 41 41 41....4141 
            buffer.write('AAAAAAAAAA',offset)
            offset+=10;
	    //write length of password
            buffer.writeInt8(8,offset);
            offset+=1;
   	    //write password bytes
            buffer.write('password',offset);
            offset+=8;
	    //write KIND text
	    buffer.writeInt8(4,offset);
	    offset+=1;
            buffer.write('HFTP',offset);
            offset+=4;
            //write Service text
            buffer.writeInt8(7,offset);
	    offset+=1;
            buffer.write('service',offset);
	    offset+=7;
		
            //writeOut secretKeys
            //1. Int keysize =0;
            //2. for key,value, no key value
            buffer.writeInt8(0,offset);
            offset+=1;
            res.writeHead(200, {'Content-Type': 'application/octet-stream','Content-Length':offset});
            var sendBuffer = buffer.slice(0,offset);
            logger.debug('sendBufferLength=%d,offset = %d',sendBuffer.length,offset); 
            res.end(sendBuffer);
            logger.info('A dummy token issued for ' + req.socket.remoteAddress);
        } else if (req.url.startsWith('/cancelDelegationToken')){
            logger.info('Cancelling a dummy token issued for ' + req.socket.remoteAddress);
            // 1.get token from url
            //var result = require('url').parse(req.url,true);
            // 2.rpc call nn cancel token
            // 3.null resp except expetion
            res.end('');
            logger.info('A dummy token cancelled,'+req.url);
        } else if (req.url.startsWith('/renewDelegationToken')){
            //1. get token from url
            logger.info('Renewing a dummy token issued for ' + req.socket.remoteAddress);
            //var result = require('url').parse(req.url,true);
            //2. rpc call nn renew
            //3.just println long println long
            res.end('2145830400'); 
            logger.info('A dummy token renewed,'+req.url);
        } else {
            proxy.web(req,res,{target:proxyDest});
        }
   }
});

logger.info('listening on ' + port);
server.listen(port);
