(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./StrikeDB"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const DB = require("./StrikeDB");
    class Test2 {
        pool;
        constructor() {
            //Use a familiar PoolConfig:
            let config = { host: 'localhost', user: 'mysql_user', password: 'mysql_password', database: 'NBA',
                supportBigNumbers: true, waitForConnections: true, connectionLimit: 10, multipleStatements: true };
            //Set up a pool which you'll call to get DBConnection objects. 
            this.pool = new DB.Pool(config);
            this.run();
        }
        async run() {
            await this.asyncTests();
            await this.otherTests();
            await this.persistentTest();
            await this.rejectionTest();
        }
        async asyncTests() {
            //Get a connection from the pool. You will be preparing statements on this connection. 
            //If the underlying connection goes away, any statement you generate will show the last error, as will 
            //the connection object we're creating here.
            let conn = await this.pool.getConnection({ rejectErrors: false, logQueries: true });
            //Prepare a statement server-side. The second paramater, emulate, defaults to false.
            let stm = await conn.prepare({ sql: `SELECT * FROM games WHERE homeID=:homeID LIMIT 1` });
            //now execute it:
            await stm.execute({ homeID: 'ATL' });
            if (stm.err)
                console.log(stm.err);
            else
                console.log(stm.result);
            //async with promises:
            let p = [];
            for (let team of ['BOS', 'CHI', 'MEM']) {
                p.push(stm.execute({ homeID: team }));
            }
            //wait for three separate statements, each with its own err or result, executed asynchronously server-side.
            let queries = await Promise.all(p);
            console.log(queries.map((s) => s.result[0]));
            //deallocate the server-side prepared statement. Important on server-side executions if you're not planning to close the connection for a long time.
            //This is not necessary if you prepared the statement using emulation.
            stm.deallocate();
            //remember to release the connection.
            conn.release();
        }
        async persistentTest() {
            await this.pool.preparePersistent('test', { sql: `SELECT * FROM games WHERE homeID=:homeID LIMIT 1` });
            let p = [];
            for (let team of ['BOS', 'CHI', 'MEM']) {
                p.push(this.pool.executePersistent('test', { homeID: team }));
            }
            //wait for three separate statements, each with its own err or result, executed asynchronously server-side.
            let queries = await Promise.all(p);
            console.log(queries.map((s) => s.result[0]));
            this.pool.deallocatePersistent('test');
        }
        async otherTests() {
            let conn = await this.pool.getConnection({ rejectErrors: false, logQueries: true });
            //You can also use ? selectors, just pass an array instead of key-value pairs.
            let stm = await conn.prepare({ sql: `SELECT * FROM games WHERE homeID=? LIMIT 1` });
            await stm.execute(['ATL']);
            if (stm.err)
                console.log(stm.err);
            else
                console.log(stm.result);
            stm.deallocate();
            //You can escape table names with ::two colons. This also works in the ?? style. 
            //This uses emulated escaping. This is NOT allowed on server-side prepares.
            let stm2 = await conn.prepare({ sql: `SELECT * FROM ::table WHERE homeID=:homeID LIMIT 1`, emulate: true });
            await stm2.execute({ table: 'games', homeID: 'ATL' });
            if (stm2.err)
                console.log(stm2.err);
            else
                console.log(stm2.result);
            //If you only need to execute something once, you can do it via exec(), which also automatically deallocates:
            let stm3 = await conn.exec({ sql: `SELECT * FROM ::table WHERE homeID=:homeID LIMIT 1`, values: { table: 'games', homeID: 'ATL' }, emulate: true });
            if (stm3.err)
                console.log(stm3.err);
            else
                console.log(stm3.result);
            conn.release();
        }
        async rejectionTest() {
            //Here we set rejectErrors:true. You must now catch rejections.
            let conn = await this.pool.getConnection({ rejectErrors: true, logQueries: true });
            //You can also use ? selectors, just pass an array instead of key-value pairs.
            let stm = await conn.prepare({ sql: `INSERT INTO nonexistent_table VALUES ('',?);`, nestTables: '_' }).
                catch((s) => { console.log('REJECTED PREPARE:', s.err.message); return (s); }); //return the failed statement you caught, or do something else with it.
            await stm.execute(['ATL']).catch((s) => { console.log('REJECTED EXECUTION:', s.err.message); return (s); });
            if (stm.err)
                console.log('CHECKED STM.ERR LATER:', stm.err.message); //you could log it in the catch, or later.
            else
                console.log(stm.result);
            stm.deallocate();
        }
    }
    new Test2();
});
