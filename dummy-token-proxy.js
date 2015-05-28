"use strict";
var http = require('http'),
    httpProxy = require('http-proxy');
var lineReader = require('line-reader');
var proxy = httpProxy.createProxyServer({});
var winston = require('winston');
var urlTools = require('url')
var qsTools = require('querystring')
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ level: 'info', timestamp: function() {
                var df = require('console-stamp/node_modules/dateformat');
                    return df(new Date(), 'HH:MM:ss.l');
                    }
                    })
               //, new (winston.transports.File)({ level:'info',filename: 'token_proxy.log', timestamp: function() {
               // var df = require('console-stamp/node_modules/dateformat');
               //     return df(new Date(), 'HH:MM:ss.l');
               //     }
               //     }),
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

//load host_ip_dict
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
        // match hostname
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
        var new_location = proxyRes.headers["location"];
  	if(!ipreg.test(hostname)){
  		var reg1 = hostname;
  		new_location = proxyRes.headers["location"].replace(hostname,host_ip_dict[hostname]); // replace the first one by default
  	}

        // match filename, and encode it, because in hadoop V2 
	var filereg = /filename=.*?[&#]/;
        var filename_str = new_location.match(filereg);
        if(filename_str!=null){
		var oriFileName = filename_str[0].substring('filename='.length,filename_str[0].length-1);
	        var encodedFileName = require('querystring').escape(oriFileName)
		new_location = new_location.replace(oriFileName,encodedFileName)
	}
  	proxyRes.headers["location"] = new_location;
  	logger.debug('replace hostname['+hostname+'] with ip['+host_ip_dict[hostname]+']: ', JSON.stringify(proxyRes.headers, true, 2));
	
  }
});

var server = require('http').createServer(function(req, res) {
        logger.debug('Serving the URL ' + req.url);
	//logger.debug('RAW_Headers'+require('util').inspect(req.headers, {depth:null}));
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
        res.end('{"long": 9223372036854775807}');
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
	    var id_Buffer = new Buffer([0x00,0x08,0x68,0x61,0x64,0x6f,0x6f,0x70,0x6d,0x63,0x08,0x68,0x61,0x64,0x6f,0x6f,0x70,0x6d,0x63,0x08,0x68,0x61,0x64,0x6f,0x6f,0x70,0x6d,0x63,0x00,0x88,0x7f,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x00,0x00])
	    var len = id_Buffer.length
            buffer.writeInt8(len,offset);
            offset+=1;
	    //write identity bytes
	    id_Buffer.copy(buffer,offset); 
            offset+=len;
	    //write length of password
	    var pwd_Buffer = new Buffer([0x00,0x00,0x01,0x4d,0x56,0xbb,0xf1,0xd7]);
            buffer.writeInt8(8,offset);
            offset+=1;
   	    //write password bytes
   	    pwd_Buffer.copy(buffer,offset);
            offset+=8;
	    //write KIND text
	    buffer.writeInt8(21,offset);
	    offset+=1;
            buffer.write('HDFS_DELEGATION_TOKEN',offset);
            offset+=21;
            //write Service text
            buffer.writeInt8(12,offset);
	    offset+=1;
            buffer.write('DummyService',offset);
	    offset+=12;
		
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
            res.writeHead(200, {'Content-Type': 'text/plain'});
            //if this value too small, date -current will be negative, then
            //there will be thousands of renewal request
            res.end('9223372036854775807\n'); 
            //logger.info('A dummy token renewed,'+req.url);
        } else {
            proxy.web(req,res,{target:proxyDest});
        }
   }
});

logger.info('listening on ' + port);
server.listen(port);
