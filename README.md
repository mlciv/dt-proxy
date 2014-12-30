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
        http://webhdfs/v1/?op=GETDELEGATIONTOKEN&user.name=alalei
    </code>
    
    or https for Hsftp
    
    <code>
    https://webhdfs/v1/?op=GETDELEGATIONTOKEN&user.name=alalei
    </code>
    
    2. Using RESTful WebHDFS protocol(hadoop-hdfs-project/hadoop-hdfs/src/main/proto/ClientNamenodeProtocol.proto)
    
    3. Transparently forward other webhdfs request to the real namenode.

### HFTP
***************

    1. Intercept HFTP servlet
    (GetDelegationToken,RenewDeletegationToken,CancelDelegationToken)
    2. Hack the binary protocol in above sevlets and issue dummy token.
    
    3. Forward others request (ListPath,/data/) to real namenode. 


see more in dummyp-token-proxy.js
