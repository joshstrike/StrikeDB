### class **Pool**
Wrapper for mysql.pool

------------

 - **getConnection(opts:{rejectErrors:boolean, logQueries?:boolean}):Promise<Connection>**
 
- - **rejectErrors**
	If set, all further mysql and internal errors on this connection reject with a Statement or Connection (whatever you are awaiting) which both contain an `.err` parameter. If rejectErrors is true, you may `.catch((e)=>e.err.message)` on any call.
	
	
- - **logQueries** 
If true, all queries performed on the connection are logged to the console.

------------

### class **Statement**
A statement generated by a connection.

------------

 - **err : mysql.MysqlError|{message:string}**
 An object which can be relied on to provide at least a message if an error occurred.
 
 - **result : mysql.OKPacket&any[]**
 The result of a query if one came back. 
 
 - **fields : mysql.FieldInfo[]**
 Standard mysql field descriptions.
 
 - **prepID : number**
 Set by `Connection.prepare()` when generating a statement, this number corresponds to the id of the remotely prepared statement.
 
 - **keys : DBBinding[]**
 Set by `Connection.prepare()`, this array contains the bindings found in the query, in order of their position, for comparison with the value object or array you will execute.
 
 - **useID : number**
 id for remote SET statements, incremented each time you execute the prepared statement.
 
 - **execute(values?:any, returnNew?:boolean):Promise&lt;Statement&gt;**
 Execute a prepared statement. 
 
 - - **values**
 `values` can be either a flat array if the statement was prepared using ??, ?, or it can be a plain object if you prepared with :name.
 
 	When preparing a statement with colons, field and table names take two colons and values take one. Field and table names may *only* be used with emulated prepares.
 
 	When using a statement like:
 `SELECT * FROM ::table WHERE id=:id`
 Your values might look like `{table:"my_table",id:1}`
 However, that would only be allowed on an emulated table. Non-emulated tables can have only `:id`, and would need to be prepared with the table name escaped in advance.
 
 	If your statement looks like this:
 `SELECT * FROM ?? WHERE id=?`
 Your values need to be a flat array in the order of the question marks, such as:
 `['my_table',1]`
 
- - **returnNew**
If true, executing this statement will return a new statement with the result and/or execution error. This is useful if you're executing a single prepared statement many times.

- **deallocate():Promise&lt;Statement&gt;**
Deallocates a prepared statement stored on the server. Necessary if you plan to leave a connection open for a long time. 

------------

### class **Connection**
Wrapper for a mysql PoolConnection. Should be created from `Pool.getConnection()`

------------

- **conn:mysql.PoolConnection**
The underlying PoolConnection.

- **err:mysql.MysqlError|{message:string,fatal?:string}**
The most recent mysql.MysqlError on the connection, or if a binding error occurred, an object with the signature `{message:string, fatal?:string}`.

- **rejectErrors:boolean** and **logQueries:boolean**
See Pool.getConnection()

- **lastInsertID():number**
Does what it says, says what it does.

- **changeUser(opts:mysql.ConnectionOptions):Promise&lt;Connection&gt;**
Wrapper for MysqlPool.changeUser()

- **prepare(sql:string, emulate?:boolean):Promise&lt;Statement&gt;**
Prepare a new statement. By default, the statement is prepared on the server. You must use emulation if you wish to bind field or table names.

- **exec(opts:mysql.QueryOptions, emulate?:boolean):Promise&lt;Statement&gt;**
Prepare, execute, and return a single statement, deallocating the prepared statement from the server afterwards.

	Takes a classic mysqljs QueryOptions which should look like:
	`{sql:SELECT * FROM table WHERE id=?',values:[1]}` 
	or 
	`{sql:'SELECT * FROM table WHERE id=:id ,values:{id:1}}`

- **beginTransaction(opts?:mysql.QueryOptions):Promise&lt;Statement&rt;**

- **rollback(opts?:mysql.QueryOptions):Promise&lt;Statement&gt;**

- **commit(opts?:mysql.QueryOptions):Promise&lt;Statement&rt;**

- **release():void**
Release the connection back to the pool.