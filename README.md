

## **StrikeDB**
### **Promisified server-side prepared statements for node mysqljs**

*Questions or comments can be directed to josh (at) thestrikeagency.com.*

**What:** StrikeDB is a set of wrappers to promisify node-mysql (mysqljs) functions, intended so you can easily use node-mysql with async / await. It also adds server-side prepared statements, and handy variable binding. **Additionally, it converts all =? or =:param bindings to <=> null-safe, and !=? or !=:param bindings to !(:param<=>val). This is so you can bind null values when executing prepared queries, and they will be treated as NULL. Be aware of this behavior. Only explicitly null bound variables, not false or undefined, are treated this way.**

The goal of this project is to make node-mysql calls a little more like the synchronous PDO model. It also has the advantage of being able to execute the same prepared statement lots of times asynchronously and awaiting all of them, which you can't do in PHP. A future execution might allow you to prepare statements across multiple connections and execute them async round-robin, but that would be down the road.

**Why:** I've worked on PHP backends for the last 20 years or so. In the last few years I've done most of my client-side work in Typescript. But I only got around to messing with Node.js in the last week or so, with lots of time to kill in quarantine.

Other promisifying shims in this vein didn't handle transactions on pools well, or they suggested enabling multiple statements as a workaround. This code gives statements first class status and associates them with their connections, so you can easily use them repeatedly, prepare statements on them, stack executions in asynchronous patterns, and release the prepared statements and underlying connections in a clear, concise way. It also allows server-side prepared statements which can be recycled fairly efficiently on the same connection.

**Why maybe not:** Prepared statements compiled and executed as SQL statements are allegedly a lot slower than those prepared on the server by a native abstraction layer, at least in the `PREPARE` phase. This is probably a boon, on the other hand, if you're planning on running that statement a thousand times. Node-mysql2 already addresses prepared statements on a lower level. However, it is not as well supported as the original node-mysql. This code also supports an "emulation mode" which shunts prepared statements to the node-mysql escaping mechanism which calls them individually instead of preparing them on the server. Emulation mode is likely faster for a single prepared statement, but it also means the escaping happens in JS rather than on the server, which I'm not 100% comfortable with.

**Why not mysql2:** I had problems using the node-mysql2/promise-mysql2 typings, because they still aren't on @DT. This has apparently been an issue since 2017 and a lot of people asked for it. I code on an older Mac, where NPM wants a newer version of XCode to run git, and Apple wants me to upgrade my OS to get XCode. I'm just trying to install a single @types package here, so that's too much work. The mysql2 typings rely on the node-mysql typings anyway, which they shouldn't. Different devs. Anyway, I decided to go with the original node-mysql and bring it up to my needs, and I thought it would be a good starting point just write something that made it behave the way I wanted it to. And it's good practice to try to write some PDO-style functionality.

**How:** Check out src/Test.ts for usage examples. I've included ./db_test.sql file if you want to run the examples directly. Or just try it out and craft your own queries.

**Error handling:** This code tries to encompass two distinct styles of error handling. You can set up your `Connection` either with `rejectErrors:true` (the default), or `false`. If `rejectErrors` is true, all mysql errors in your awaiting code must be caught as a rejected promise. Promises reject with a `Statement` or `Connection`, whichever the Promise would normally resolve as. Both have an `.err` parameter. There are a few cases of non-mysql errors, like failed bindings, which return with at least an `.err{message:string}` so you can always rely on that value.

If you set `rejectErrors` to false, it's a bit more like the PHP model where mysql errors are caught internally, sparing you unnecessary uncaught promise rejections on your queries. However, if you do that, you will have downstream rejections if your queries fail and you try to get their results... so if you don't want to catch rejections on your query promises, you need to check the statements to see whether `.err` is set. Which is basically the same as PHP, where you have to check after the query whether it worked, rather than having it throw an error in the middle of your execution. Like PDO, `Connection.err` holds the last error caught. And if your statement managed to compile before failing, `Statement.err` will show the same one.

**Feel free to use and improve this code, if it's helpful. Feedback is always welcome.**

------------

### type **PoolOpts**={rejectErrors?:boolean, logQueries?:boolean, sessionTimezone?:string}

- **rejectErrors : boolean**
	If set, all further mysql and internal errors on this connection reject with a Statement or Connection (whatever you are awaiting) which both contain an `.err` parameter. If rejectErrors is true, you may `.catch((e)=>e.err.message)` on any call.


- **logQueries : boolean** 
If true, all queries performed on the connection are logged to the console.

- **sessionTimezone : string**
By default, node-mysql parses DATE, DATETIME and TIMESTAMP types into Javascript Date objects. Specifically, node-mysql treats dates as if they are in the timezone specified by `mysql.PoolConfig.timezone`. The default for that is `local`, which means dates are converted as if the sql server is in the same timezone as the node environment. This can cause a lot of confusion, and I don't find it helpful to have middleware parsing dates that way, as I usually prefer to either know where my SQL server is and let the end client parse the dates, or else tell the database what timezone I want my dates output in based on the view I'm looking for, and let the end client treat them all as local. Either way, having a third step can throw a wrench into things. I use `mysql.PoolConfig.dateStrings:true` to prevent the date parsing behavior and simply return the strings SQL is returning.

	**`sessionTimezone`**, if it is set on a pool or an individual connection,  calls `SET SESSION time_zone=${sessionTimezone}` prior to executing any other SQL.  It may be used in conjunction with PoolConfig's timezone to align the two, or used with dateStrings.
	
	**Be aware that like all other session variables, timezones persist after you release the connection back to the pool.**

### class **Pool**
**constructor(config:mysql.PoolConfig, opts?:PoolOpts)**

Wrapper for mysql.pool. This is the only class you should instantiate directly. The parameter `config` is a standard PoolConfig.

The `opts` parameter sets the default options that will be applied to any connection gotten from the pool via `getConnection()`. These can be overridden individually if you provide options to the `getConnection()` call.

The default options if none are passed to the constructor are `rejectErrors:true`, `logQueries:true`, `sessionTimezone:undefined`. See **PoolOpts** for more detail.

------------

 - **getConnection(opts?:PoolOpts):Promise<Connection>**

------------

### type StatementOpts = mysql.QueryOptions&{emulate?:boolean};
StatementOpts are created on a Statement when it's prepared, or required when `Connection.exec()` is called. 

The parameters `timeout`, `nestTables` and `typeCast` are supported and are used in all executions of the Statement.

`StatementOpts` are the same as `QueryOptions` except with one additional parameter, `emulate`, which determines whether the prepared statement is emulated in JS or is prepared server-side. During `prepare(opts:StatementOpts)` the `opts.values` field is ignored, since new values are expected to be passed when you `execute(values)`. All immediate calls such as `Connection.exec()` will take the `values` passed in the StatementOpts.

------------

### class **Statement**
A statement generated by a connection. This class is prepared or returned by `Connection.exec()` and should not be instantiated directly.

------------

 - **err : mysql.MysqlError|{message:string}**
 An object which can be relied on to provide at least a message if an error occurred.
 
 - **result : mysql.OKPacket&any[]**
 The result of a query if one came back. 
 
 - **fields : mysql.FieldInfo[]**
 Standard mysql field descriptions.
 
 - **prepID : number**
 Internal id set by `Connection.prepare()` when generating a statement, this number corresponds to the id of the remotely prepared statement.
 
 - **keys : Binding[]**
 Set by `Connection.prepare()`, this array contains the bindings found in the query, in order of their position, for comparison with the value object or array you will execute.
 
 - **useID : number**
 Internal id for setting remote variables prior to each execution. Specifically,  we call`SET @k_useID=value;`, in which `k` is the numeric position of the bound variable in the binding array and `useID` is incremented each time you execute the prepared statement. This prevents asynchronous executions from conflicting. See also **returnNew** below.
 
 - **execute(values?:any, returnNew?:boolean):Promise&lt;Statement&gt;**
 Execute a prepared statement. 
 
 - - **values : any**
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
 
- - **returnNew : boolean**
If `true`, executing this statement will return a new statement with the result and/or execution error. This is necessary if you're executing a single prepared statement many times asynchronously in a `Promise.all()`. Executing with `returnNew` allows you to collect a list of new statements, each with the original query but with its own results or errors. 

	Normally, `execute()` both updates and returns the original statement. ***New instances of `Statement` returned from `returnNew` are clones. If they are real server-side prepared statements, they cannot be executed again. Only the original statement may be re-executed.*** If the original Statement is not emulated and you try to re-execute the resulting new statement, it will return an `.err` that you have tried to execute an unprepared statement. This is because the resulting new Statement was not prepared server-side. The new Statement returned lacks a `prepID`, intentionally, to prevent it from being executed against existing set @vars. Preventing re-execution of cloned statements is to prevent thread races on their stored variable names.

- **deallocate() : Promise&lt;Statement&gt;**
Deallocates a prepared statement stored on the server. StrikeDB by default allows up to 1000 uniquely named prepared statements ***per pool*** (stm_0 through stm_999). It will then overwrite the first one. If you prepare a statement, set it aside, then prepare 1000 more statements, then execute the first one, you'll be surprised to find it executes the one you prepared last. The good news is, this means you don't usually have to worry about deallocating them. You can also increase the 1000 limit in the `NameFactory` class. The point of this is that we don't expect a prepared statement to be held that long and executed later.

	MySQL's `max_prepared_stmt_count` defaults to 16,382, and you'll get an error if you try to prepare more than that without deallocating. Using looping names lets us avoid the problem. However, if your style of coding involves keeping a prepared statement around basically forever and invoking it intermittently while preparing lots of other statements, you will probably want to switch the naming pattern to something involving uuids (for which there is a stub in the code). If you do, you'll need to be absolutely sure to `deallocate()` statements as you finish with them, to avoid eventually hitting MySQL's limit.

	Statements are stored on individual connections, so once released, a connection can be reaquired with unpredictable statements already stored on it. This doesn't matter as they will be overwritten once the pool's naming gets back around to them; just something to be aware of.

------------

### class **Connection**
Wrapper for a mysql PoolConnection. Should be created from `Pool.getConnection()`

------------

- **conn : mysql.PoolConnection**
The underlying PoolConnection.

- **err : mysql.MysqlError|{message:string,fatal?:string}**
The most recent mysql.MysqlError on the connection, or if a binding error occurred, an object with the signature `{message:string, fatal?:string}`.

- **rejectErrors : boolean** and **logQueries:boolean**
See Pool.getConnection()

- **lastInsertID() : number**
Does what it says, says what it does.

- **changeUser(opts:mysql.ConnectionOptions) : Promise&lt;Connection&gt;**
Wrapper for MysqlPool.changeUser()

- **prepare(opts:StatementOpts) : Promise&lt;Statement&gt;**
Prepare a new statement. By default, the statement is prepared on the server. ***You must use emulation if you wish to bind field or table names.*** 

	Additional options set when preparing a statement, such as `nestTables` or `timeout`, will apply to the statement each time you execute it.

	`opts.values` is ignored when preparing a statement. The values should be sent when you execute it.

- **exec(opts:StatementOpts) : Promise&lt;Statement&gt;**
Prepare, execute, and return a single statement, deallocating the prepared statement from the server afterwards.

	Takes a classic mysqljs QueryOptions which should look like:
	`{sql:SELECT * FROM table WHERE id=?',values:[1]}` 
	or 
	`{sql:'SELECT * FROM table WHERE id=:id ,values:{id:1}}`

- **beginTransaction(opts?:mysql.QueryOptions) : Promise&lt;Statement&rt;**

- **rollback(opts?:mysql.QueryOptions) : Promise&lt;Statement&gt;**

- **commit(opts?:mysql.QueryOptions) : Promise&lt;Statement&rt;**

- **release() : void**
Release the connection back to the pool.
