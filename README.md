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
5. curl http://127.0.0.1:12351/data/opt/


see more in dummyp-token-proxy.js
