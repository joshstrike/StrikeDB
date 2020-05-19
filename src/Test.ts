import * as mysql from 'mysql';
import * as DB from './StrikeDB';

class Test {
    public pool:DB.Pool;
    public constructor() {
        //Use a familiar PoolConfig:
        let config:mysql.PoolConfig = {host:'localhost',user:'my_user',password:'my_password',database:'NBA',
                                        supportBigNumbers:true,waitForConnections:true,connectionLimit:10};
        
        //Set up a pool which you'll call to get DBConnection objects. 
        this.pool = new DB.Pool(config);
        
        this.asyncTests();
        this.otherTests();
        this.rejectionTest();
    }
    public async asyncTests():Promise<void> {
        //Get a connection from the pool. You will be preparing statements on this connection. 
        //If the underlying connection goes away, any statement you generate will show the last error, as will 
        //the connection object we're creating here.
        let conn:DB.Connection = await this.pool.getConnection({rejectErrors:false,logQueries:true});
        
        //Prepare a statement server-side. The second paramater, emulate, defaults to false.
        let stm:DB.Statement = await conn.prepare(`SELECT * FROM games WHERE homeID=:homeID LIMIT 1`,false);
        //now execute it:
        await stm.execute({homeID:'ATL'});
        if (stm.err) console.log(stm.err); else console.log(stm.result);
        //execute it again... note that if the second param (returnNew) is not true, the original statement's result and err will be overwritten.
        let newStm:DB.Statement = await stm.execute({homeID:'DEN'},true);
        
        //async with promises:
        let p:Promise<DB.Statement>[] = [];
        for (let team of ['BOS','CHI','MEM']) {
            p.push(stm.execute({homeID:team}, true));
        }
        //wait for three separate statements, each with its own err or result, executed asynchronously server-side.
        let statements:DB.Statement[] = await Promise.all(p);
        console.log(statements.map((s)=>s.result));
        
        //deallocate the server-side prepared statement. Important on server-side executions if you're not planning to close the connection for a long time.
        //This is not necessary if you prepared the statement using emulation.
        stm.deallocate(); 
        
        //remember to release the connection.
        conn.release();
    }
    public async otherTests():Promise<void> {
        let conn:DB.Connection = await this.pool.getConnection({rejectErrors:false,logQueries:true});
    
        //You can also use ? selectors, just pass an array instead of key-value pairs.
        let stm:DB.Statement = await conn.prepare(`SELECT * FROM games WHERE homeID=? LIMIT 1`,false);
        await stm.execute(['ATL']);
        if (stm.err) console.log(stm.err);
            else console.log(stm.result);
        stm.deallocate();
        
        //You can escape table names with ::two colons. This also works in the ?? style. 
        //This uses emulated escaping. This is NOT allowed on server-side prepares.
        //Set the second parameter of prepare() for emulated prepares. 
        let stm2:DB.Statement = await conn.prepare(`SELECT * FROM ::table WHERE homeID=:homeID LIMIT 1`,true);
        await stm2.execute({table:'games',homeID:'ATL'});
        if (stm2.err) console.log(stm2.err);
            else console.log(stm2.result);
        
        //If you only need to execute something once, you can do it via exec(), which also automatically deallocates:
        let stm3:DB.Statement = await conn.exec({sql:`SELECT * FROM games WHERE homeID=:homeID LIMIT 1`,values:{homeID:'ATL'}});
        if (stm3.err) console.log(stm3.err);
            else console.log(stm3.result);
        
        conn.release();
    }
    public async rejectionTest():Promise<void> {
        //Here we set rejectErrors:true. You must now catch rejections.
        let conn:DB.Connection = await this.pool.getConnection({rejectErrors:true,logQueries:true});
    
        //You can also use ? selectors, just pass an array instead of key-value pairs.
        let stm:DB.Statement = await conn.prepare(`SELECT * FROM games WHERE homeID=? LIMIT 1`,false).catch((s:DB.Statement)=>s);
        await stm.execute(['ATL']).catch((s:DB.Statement)=>s);
        if (stm.err) console.log(stm.err); //you could log it in the catch, or later.
            else console.log(stm.result);
        stm.deallocate();
    }
}
new Test();