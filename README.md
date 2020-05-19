## **StrikeDB**
### **Promisified server-side prepared statements for node mysqljs**

Questions or comments can be directed to josh (at) thestrikeagency.com.

**What:** StrikeDB is a set of wrappers to promisify node-mysql (mysqljs) functions, intended so you can easily use node-mysql with async / await. It also adds server-side prepared statements, and handy variable binding. **Additionally, it converts all =? or =:param bindings to <=> null-safe, and !=? or !=:param bindings to !(:param<=>val). Be aware of this behavior.** The goal is to make node-mysql calls a little more like the synchronous PDO model. It also has the advantage of being able to execute the same prepared statement lots of times asynchronously and awaiting all of them, which you can't do in PHP.

**Why:** I've worked on PHP backends for the last 20 years or so. In the last few years I've done most of my client-side work to Typescript. But I only got around to messing with Node.js in the last week or so, with lots of time to kill in quarantine.
Other promisifying shims in this vein didn't handle transactions on pools well, or they suggested enabling multiple statements as a workaround. This code gives statements first class status and associates them with their connections, so you can easily use them repeatedly, prepare statements on them and stack them in asynchronous patterns, and release them in a clear, concise way. It also allows server-side prepared statements which can be recycled fairly efficiently on the same connection.

**Why maybe not:** Prepared statements compiled and executed as SQL statements are allegedly a lot slower than those prepared on the server by a native abstraction layer. This is probably less of an issue if you're planning on running that statement a thousand times. Node-mysql2 already addresses prepared statements on a lower level. However, it is not as well supported as the original node-mysql. This code also supports an "emulation mode" which shunts prepared statements to the node-mysql escaping mechanism instead of preparing them on the server.

**Why not mysql2:** I had problems using the node-mysql2/promise-mysql2 typings, because they still aren't on @DT. This has apparently been an issue since 2017. I work on an older Mac, where NPM wants a newer version of XCode to run git, and Apple wants me to upgrade my OS to get XCode. I'm just trying to install a single package here, so that's too much work. The mysql2 typings rely on the node-mysql typings anyway, which they shouldn't. Different dev. Anyway, I decided to go with the original node-mysql and bring it up to my needs, and I thought it would be a good starting point just write something that made it behave the way I wanted it to. And good general practice to try to write some PDO-style functionality.

**How:** Check out src/Test.ts for usage examples. I've included ./db_test.sql file if you want to run the examples directly. Or just try it out and craft your own queries.

**Error handling:** This code tries to encompass two distinct styles of error handling. You can set up your DBConnection either with rejectErrors==true (the default), or false. If errorsReject is true, all mysql errors in your await / .then code must be caught as a rejected promise. Promises reject with a DBStatement or DBConnection you called on. Both have an .err parameter. If you set rejectErrors to false, it's a bit more like the PHP model where mysql errors are caught internally, sparing you unnecessary uncaught promise rejections on your queries. However, if you do that, you will have downstream rejections if your queries fail and you try to get their results... so if you don't want to catch rejections on your query promises, you need to check the statements to see whether .err is set. Which is basically the same as PHP, where you have to check after the query whether it worked, rather than having it throw an error in the middle of your execution. Like PDO, the last error caught is the DBConnection.err. And if your statement managed to compile before failing, DBStatement.err will show that.

Feel free to use and improve, if it's helpful. Feedback is always welcome.

