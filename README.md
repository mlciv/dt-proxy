dt-proxy
===========

Issue dummy_token for webhdfs and HFTP

# Background
**********************

using distcp to copy data between secure and insecure hadoop clusters(usually
        different version) will encounter the following issues:
1. Get token from insecure namenode
   When distcp job running on secure cluster, every task need full access to
   datanodes in insecure cluster, including network and secure authocation. Most
   importantly, the job need get (dt)Delegation Token to access data stored in insecure
   datanodes.
   <pre>
   <code>
   14/12/25 13:31:31 WARN security.SecurityUtil: Failed to get token for service
   xxx.xxx.xxx.xxx:50070
   </code>
   </pre>
2. Different RPC protocols
    We can only use webhdfs and hftp to bridge the data transfering bewteen different hadoop versions.
3. Different dfs-checksum-type
    //TODO
    

# Possible Solutions
*********************

1. Adding this token proxy in front of insecure namenode, it will issue dummy
   token to distcp client so that WebHdfsFileSystem or HftpFileSystem will not
   throw fatal Exception. The fatal Exception will interrput distcp.  

2. Specify the -Dfs.webhdfs.impl=<classpath>.SimpleAuthWebHdfsFileSystem(TODO) 
<p>
<code>
public class SimpleAuthWebHdfsFileSystem extends WebHdfsFileSystem {
  @Override public Token<DelegationTokenIdentifier> getDelegationToken(String
          renewer)
      throws IOException {
          return null;
        }
}
</code>
</p>


# Implements
****************
### WebHDFS
****************

    1. Intercept http requests
    
    (GetDelegationToken,RenewDeletegationToken,CancelDelegationToken)
    <code>
        webhdfs://xxxxxx:50070/
    </code>
    will automatically change to 
    
    <code>
        http://webhdfs/v1/?op=GETDELEGATIONTOKEN&user.name=xxxx
    </code>
    
    or https for Hsftp
    
    <code>
    https://webhdfs/v1/?op=GETDELEGATIONTOKEN&user.name=xxxx
    </code>
    
    2. Using RESTful WebHDFS protocol(hadoop-hdfs-project/hadoop-hdfs/src/main/proto/ClientNamenodeProtocol.proto)
    
    3. Transparently forward other webhdfs request to the real namenode.

### HFTP
***************

    1. Intercept HFTP servlet
    (GetDelegationToken,RenewDeletegationToken,CancelDelegationToken)
    2. Hack the binary protocol in above sevlets and issue dummy token.
    
    3. Forward others request (ListPath,/data/) to real namenode. 

### Replace unresolved hostname to IP
****************
    When running /data/ handle to fetching data from the real hdfs namenode that the proxy delegate, the namenode will repsonse the /data/ handle with a "LOCATION" in the http header as the following:
    <pre>
    <code>
  "location": "http://tslave075031.hadoop.sohuno.com:1006/streamFile?filename=/user/hadoopmc/test/hadoop-core-0.20.2-cdh3u1.jar&ugi=alalei&delegation=CkFBQUFBQUFBQUEIcGFzc3dvcmQVSERGU19ERUxFR0FUSU9OX1RPS0VOEjEwLjMxLjcyLjEwMToxMjM1Nw",
    </code>
    </pre>
  Proxy will forword this header to the client.
  However, the client may cannot resove the "tslave075031.hadoop.sohuno.com" hostname in result that the client command failed. 
  Previously, we simply modified the /etc/hosts on every client node to work around this issue. However, it will be a big disaster to append thousands of hostname to every node.
  So we incepter the proxyRes event of http-proxy, load the host_ip_dict(the same with /etc/host), and replace the unresolved hostname with corresponding ip by lookup the "host_ip_dict" dictionary. Finally, every node wil receive the LOCATION header withe IP not the unresolved hostname.
  <pre>
  <code>
16:39:11.022 - debug: RAW Response from the target {
  "location": "http://tslave075031.hadoop.sohuno.com:1006/streamFile?filename=/user/hadoopmc/test/hadoop-core-0.20.2-cdh3u1.jar&ugi=alalei&delegation=CkFBQUFBQUFBQUEIcGFzc3dvcmQVSERGU19ERUxFR0FUSU9OX1RPS0VOEjEwLjMxLjcyLjEwMToxMjM1Nw",
  "connection": "close",
  "server": "Jetty(6.1.26)"
}
16:39:11.023 - info: replace hostname[tslave075031.hadoop.sohuno.com] with ip[10.31.75.31]:  {
  "location": "http://10.31.75.31:1006/streamFile?filename=/user/hadoopmc/test/hadoop-core-0.20.2-cdh3u1.jar&ugi=alalei&delegation=CkFBQUFBQUFBQUEIcGFzc3dvcmQVSERGU19ERUxFR0FUSU9OX1RPS0VOEjEwLjMxLjcyLjEwMToxMjM1Nw",
  "connection": "close",
  "server": "Jetty(6.1.26)"
}
  </code>
  </pre>
 
### Test
1. Enable debug log
export HADOOP_ROOT_LOGGER=DEBUG,console

2. Setup dt-proxy to namenode  
nohup node dummy-token-proxy.js 12351 http://your-real-namenode:50070 &

3. Test token
hdfs dfs -ls hftp://10.31.72.101:12351/user/nlp &>ls_out_log
When the hftpclient(HftpFileSystem) received the valid token, it will print the folllowing debug log in ls_out_log
We using 41 41 41... as our identity.

15/01/21 16:40:41 DEBUG security.SecurityUtil: Acquired token Kind: HFTP delegation, Service: XX.XX.XXX.XXX:12351, Ident: 41 41 41 41 41 41 41 41 41 41
15/01/21 16:40:41 DEBUG fs.FileSystem: Got dt for hftp://XXX.XX.XX.XX:12351;t.service=XXX.XX.XX.XX:12351
15/01/21 16:40:41 DEBUG fs.FileSystem: Created new DT for XX.XX.XX.XX:12351



Also, you can check dt-proxy by using simple curl command as following:
1. curl http://127.0.0.1:12351/getDelegationToken
2. curl http://127.0.0.1:12351/renewDelegationToken?asasas
3. curl http://127.0.0.1:12351/cancelDelegationToken?assas
4. curl http://127.0.0.1:12351/listPaths/user/
5. curl -vv http://127.0.0.1:12351/data/{your-real-file-in-real-hdfs}
more comprehessive test: 
1. hadoop dfs -get  hftp://10.31.72.101:12357/{your-real-file-in-real-hdfs} 
2. hadoop jar hadoop-distcp-3.0.0-SNAPSHOT.jar -Dmapred.job.queue.name=rdipin -skipcrccheck -strategy dynamic -m 2 -update  hftp://10.31.72.101:12357/your-source-file hdfs://your-dest-file

see more in dummyp-token-proxy.js
