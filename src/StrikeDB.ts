import * as mysql from 'mysql';
import * as util from 'util';
import { v4 as uuidv4 } from 'uuid';
import { BindParser, Binding } from './BindParser';

//leave this pretty loosely typed, generally we're expecting either an OKPacket or a rowset.
export type Result = mysql.OkPacket&any[];
export type Rejection = {err:mysql.MysqlError|{message:string}};

class NameFactory {
    //Numbering of prepared statement names. This range should be wide enough to accommodate the max number of normal 
    //non-persistent statements expected to be allocated at any given time.
    private static _NUM:number = 0;
    public static get NUM():number {
        this._NUM = (this._NUM+1)%1000;
        return (this._NUM);
    }
}

export type InHelper = {sql:string,keyvals:{[key:string]:(string|number)}};
export class Util {
    /**
     * Helper for WHERE `id` IN (1,2) statements. Example:
     * 
     * let idHelper:InHelper = Util.GetInHelper('id',[1,2]);
     * let stm:Statement = await conn.prepare(`SELECT * FROM table WHERE id IN (${idHelper.sql})`);
     * await stm.execute(Object.assign({table:'games',field:'homeID'},i.keyvals)); //merge the helper's pairs into the bind object.
     * 
     * @param name a unique name for the set.
     * @param vals
     */
    public static GetInHelper(name:string,vals:(string|number)[]):InHelper {
        let sql:string = "";
        let keyvals:{[key:string]:string} = {};
        for (let k:number=0;k < vals.length;k++) {
            sql += (k > 0 ? `,` : ``) + `:${name}${k}`;
            keyvals[`${name}${k}`] = <any>vals[k];
        }
        return {sql:sql, keyvals:keyvals};
    }
}

export type ConnOpts = {rejectErrors?:boolean,logQueries?:boolean,sessionTimezone?:string|boolean};
export type PersistentStatement = {handle:string,conn:Connection,stm:Statement,origOpts:StatementOpts};
export class Pool {
    public _pool:mysql.Pool;
    private _connOpts:ConnOpts = {rejectErrors:true,logQueries:true,sessionTimezone:false};
    private _persistentStatements:PersistentStatement[] = [];
    public constructor(config:mysql.PoolConfig,opts?:ConnOpts) {
        if (opts) {
            for (let k in opts) this._connOpts[k] = opts[k];
        }
        this._pool = mysql.createPool(config);
    }
    private _optsToDefault(o?:ConnOpts):ConnOpts {
        if (!o) o = this._connOpts;
        for (let k in this._connOpts) {
            if (o[k]===undefined) o[k]=this._connOpts[k];
        }
        return (o);
    }
    public async getConnection(connOpts?:ConnOpts,enqueueTimeout:number = 10000):Promise<Connection> {
        let _connOpts:ConnOpts = this._optsToDefault(connOpts);
        let connPromise:()=>Promise<mysql.PoolConnection> = util.promisify(this._pool.getConnection).bind(this._pool);
        let dbc:Connection = await new Promise<Connection>(async (resolve,reject)=>{
            if (enqueueTimeout > 0) setTimeout(()=>{ if (!dbc) reject(); }, enqueueTimeout);
            let dbc:Connection = await connPromise().then((c:mysql.PoolConnection)=>{return new Connection(_connOpts,c,null);})
                                            .catch((e:mysql.MysqlError)=>{return new Connection(_connOpts,null,e);});
            resolve(dbc);
        }).catch(()=>null);
        if (_connOpts.sessionTimezone) await dbc._query({sql:`SET SESSION time_zone='${_connOpts.sessionTimezone}';`});
        return (dbc);
    }
    private _getPSByHandle(handle:string):PersistentStatement {
        return (this._persistentStatements.find((p)=>p.handle==handle));
    }
    public hasPersistent(handle:string):boolean {
        return (this._getPSByHandle(handle) ? true : false);
    }
    public async preparePersistent(handle:string,opts:StatementOpts):Promise<boolean> {
        let _okStatement:PersistentStatement = this._persistentStatements.find((p)=>p.conn.conn && !p.conn.err);
        let conn:Connection = _okStatement ? _okStatement.conn : await this.getConnection();
        if (!conn || conn.err) return (false);
        
        let existing:PersistentStatement = this._getPSByHandle(handle);
        if (existing) this._persistentStatements.splice(this._persistentStatements.indexOf(existing),1);
        
        opts.uuid = true;
        let origOpts = Object.assign({},opts);
        let stm:Statement = await conn.prepare(opts);
        this._persistentStatements.push({handle:handle,conn:conn,stm:stm,origOpts:origOpts});
        return (true);
    }
    public async executePersistent(handle,values?:any):Promise<Query> {
        let ps:PersistentStatement = this._getPSByHandle(handle);
        if (!ps) throw new Error(`Cannot execute statement '${handle}' - statement was not found.`);
        let qry:Query = await ps.stm.execute(values).catch((s)=>s);
        if (ps.conn.err) {
            await ps.conn.release();
            for (let f of this._persistentStatements) { console.log(f.handle,f.conn.conn ? f.conn.conn.threadId : 'none')}
            let ok:boolean = await this.preparePersistent(handle, ps.origOpts);
            if (ok) {
                //The old ps has been replaced on a successful connection. Reference the new one for execution and return.
                ps = this._getPSByHandle(handle);
                qry = await ps.stm.execute(values).catch((s)=>s);
            } else {
                //The old ps has not been replaced; no connection could be made.
                ps.stm.err = {message:'Could not get a connection.'};
                qry = ps.stm;
            }
        }
        if (qry.err && this._connOpts.rejectErrors) return Promise.reject(qry);
        return (qry);
    }
    public async deallocatePersistent(handle:string):Promise<void> {
        let ps:PersistentStatement = this._getPSByHandle(handle);
        if (!ps) return;
        this._persistentStatements.splice(this._persistentStatements.indexOf(ps),1);
        try {
            await ps.stm.deallocate();
        } catch (e) {}
        if (!this._persistentStatements.filter((p)=>p.conn==ps.conn).length) await ps.conn.release();
    }
    public async exec(statementOpts:StatementOpts,connOpts?:ConnOpts):Promise<Query> {
        let conn:Connection = await this.getConnection(connOpts,1000);
        if (!conn) {
            let q:Query = new Query(conn,statementOpts);
            q.err = {message:'Could not get a connection'};
            if ((connOpts && connOpts.rejectErrors) || (!connOpts && this._connOpts.rejectErrors)) return Promise.reject(q);
            return (q);
        }
        let q:Query = await conn.exec(statementOpts).catch((_q)=>_q);
        conn.release();
        if (q.err && conn.opts.rejectErrors) return (Promise.reject(q));
        return (q);
    }
}

export class Query {
    public err:mysql.MysqlError|{message:string};
    public result:Result;
    public fields:mysql.FieldInfo[];
    public constructor(public _dbc:Connection, public _opts:mysql.QueryOptions) {}
}
export type StatementOpts = mysql.QueryOptions&{emulate?:boolean,uuid?:boolean};
export class Statement extends Query {
    public prepID:number|string = null; //set from Connection.prepare();
    public keys:Binding[] = null; //set from Connection.prepare();
    public useID:number = 0;

    public constructor(public _dbc:Connection, public _execOpts?:StatementOpts) {
        super(_dbc, _execOpts);
    }
    public async execute(values?:any):Promise<Query> {
        let timeout:number, nestTables:any, typeCast:mysql.TypeCast;
        if (this._execOpts) {
            timeout = this._execOpts.timeout;
            nestTables = this._execOpts.nestTables;
            typeCast = this._execOpts.typeCast;
        }
        
        let v:any[] = [];
        let bindError:string;
        if (!this.keys) {
            v = values;
        } else if (values) {
            v = this.keys.reduce((r,k)=>{
                //kinda like !isset()
                if (values[k.name]===undefined) { //don't throw if it's specified but intentionally null. The one time I've been glad there's a difference!
                    this.err = {message:`EXECUTION ERROR: Bound variable \`${k.name}\` is undefined`};
                }
                r.push(values[k.name]);
                return (r);
            },[]);
            if (this.err) {
                this._dbc.err = this.err;
                if (this._dbc.rejectErrors) return Promise.reject(this);
                return (this);
            }
        }
        
        //convert to a standard query.
        if (this._execOpts.emulate) 
            return (this._emulatedExecute({sql:this._execOpts.sql,values:v,timeout:timeout,nestTables:nestTables,typeCast:typeCast}));
        
        if (this.prepID===null && !this.err) {
            this.err = this._dbc.err = {message:`Attempted to execute an unprepared statement. Non-emulated statements returned as new from previously executed ones may not themselves be executed again. This is to prevent a thread race for same-name parameters. You should re-execute the original statement.`};
            if (this._dbc.rejectErrors) return Promise.reject(this);
            return(this);
        }
        
        let vars:string[] = await this._use(v);
        
        if (this._dbc.err) { //_dbc.err will be set by _use if there's an internal problem with any SET.
            this.err = this._dbc.err;
            if (this._dbc.rejectErrors) return Promise.reject(this); //exec error in this part returns the initial setup statement. Error is on the connection.
            return (this);
        }
        
        //Create a new execution statement. We return the new one to replace this one.
        let varstr:string = '';
        if (vars.length) varstr = "USING "+vars.join(',');
        let _s:string = `EXECUTE stm_${this.prepID} ${varstr};`;
        if (this._dbc.logQueries) console.log(_s);
        //_query() / _act() fills in any stm.err as well as the connection's err.
        let qry:Query = await this._dbc._query({sql:_s,timeout:timeout,nestTables:nestTables,typeCast:typeCast}).catch((e:Statement)=>{ return (e); });
        this.err = qry.err;
        this.result = qry.result;
        this.fields = qry.fields;
        
        //clean up the session vars
        if (vars.length) {
            let p:Promise<Query>[] = [];
            for (let u of vars) p.push(this._dbc._act('query',{sql:`SET ${u}=NULL;`}));
            let s:Query[] = await Promise.all(p).catch((e:Query)=>{
                this._dbc.err = e.err; return([e]);
            });
        }

        if (qry.err && this._dbc.rejectErrors) return Promise.reject(qry);
        return (qry);
    }
    /**
     * Alternate shunt for executing w/o actually setting up a server prepared statement.
     * @param values
     */
    protected async _emulatedExecute(opts?:mysql.QueryOptions):Promise<Statement|Query> {
        let qry:Query;
        if (this._dbc.rejectErrors) qry = await this._dbc._act('query',opts).catch((s:Statement)=>s); //must handle internally
            else qry = await this._dbc._act('query',opts);
        
        if (this._dbc.logQueries) console.log('Executed (emulated):',opts.sql,'with',opts.values);

        //copy the newly generated stm values to this.
        this.err = qry.err;
        this.result = qry.result;
        this.fields = qry.fields;

        if (qry.err) {
            this._dbc.err = qry.err;
            if (this._dbc.rejectErrors) return Promise.reject(qry);
        }
        
        return (qry);
    }
    /**
     * Sets up the user-allocated vars for the execution and returns a string to put into EXECUTE with those sql vars.
     * @param values
     */
    protected async _use(values:any[]):Promise<string[]> {
        if (!values || !values.length) return ([]);
        //increment the statement's useID prior to every execution to preserve variables held for other executions.
        //this allows you to asynchronously call execute with different parameters on the same prepared statement at the same time, and await Promise.all(). 
        this.useID++;
        let vars:string[] = [];
        let p:Promise<Query>[] = [];
        let unsetters:string[] = [];
        for (let k:number=0;k < values.length;k++) {
            let _val:string = values[k]===null ? 'NULL' : `'${values[k]}'`;
            let _key:string = `@${this.prepID}_${k}_${this.useID}`;
            let _s:string = `SET ${_key}=${_val};`;
            unsetters.push(_key);
            if (this._dbc.logQueries) console.log(_s);
            p.push(this._dbc._act('query',{sql:_s},true,true)); //SET @a_${useID}=1
            vars.push(`@${this.prepID}_${k}_${this.useID}`); //USING @a, @b... returned to the execution statement.
        }
        //catch this part internally when setting up a prepared statement; return the connection with the actual errr...
        await Promise.all(p).catch((e:Statement)=>{ this._dbc.err = e.err; });
        return (vars);
    }
    public async deallocate():Promise<Statement> {
        //Deallocation is crucial when using pooled connections.
        if (this._execOpts.emulate) return (this);
        await this._dbc._act('query',{sql:`DEALLOCATE PREPARE stm_${this.prepID}`},false,true).catch((e:Statement)=>this._dbc.release());
        return (this);
    }
}

export class Connection {
    private _lastResult:Result;
    private _lastFields:mysql.FieldInfo[];
    public constructor(public opts?:ConnOpts, public conn?:mysql.PoolConnection, public err?:mysql.MysqlError|{message:string,fatal?:string}) {}
    
    public get rejectErrors():boolean {
        return (this.opts.rejectErrors);
    }
    public get logQueries():boolean {
        return (this.opts.logQueries);
    }
    /**
     * Internal call for acting on the connection. Rewrites the func:string to a call on the conn and returns / rejects with a Query.
     * The statement is never prepared or executed, it is just assembled here from the options and the call's result.
     * @param func
     * @param opts
     * @param overwriteResult
     * @param forceRejectErrors
     */
    public async _act(func:string,opts?:mysql.QueryOptions,overwriteResult:boolean = true,forceRejectErrors?:boolean):Promise<Query> {
        //By definition, 'emulate' is irrelevant for _act statements. They are never prepared, but assembled here and run immediately raw.
        //For example, PREPARE and EXECUTE are both handled through _act().
        let qry:Query = new Query(this,opts);
        if (!this.conn || (this.err && this.err.fatal)) {
            qry.err = this.err;
            if (this.rejectErrors || forceRejectErrors) return Promise.reject(qry);
            return (qry);
        }
        //Automated promisifying strips out the fieldinfo, which we want to retain. Promisify by hand. Always resolve here. Reject later if there's an err.
        let q:Promise<mysql.QueryFunction> = new Promise((resolve)=>{
            this.conn[func].bind(this.conn)(opts,(err:mysql.MysqlError,result:any,fields:mysql.FieldInfo[])=>{
                if (err) {
                    qry.err = err;
                    return resolve();
                }
                if (overwriteResult) {
                    this._lastResult = result;
                    this._lastFields = fields;
                }
                qry.result = result;
                qry.fields = fields;
                return resolve();
            });
        });
        await q;
        
        //if there's an error, either reject or return this object with the error.
        if (qry.err) {
            this.err = qry.err;
            if (this.rejectErrors || forceRejectErrors) return Promise.reject(qry);
        }
        return (qry);
    }
    public async changeUser(opts:mysql.ConnectionOptions):Promise<Connection> {
        if (!this.conn || (this.err && this.err.fatal)) {
            if (this.rejectErrors) return Promise.reject(this);
            return (this);
        }
        let c:mysql.PoolConnection = await util.promisify(this.conn.changeUser).bind(this.conn)(opts).catch((e:mysql.MysqlError)=>{ this.err = e; });
        if (!c) {
            this.release();
            if (this.rejectErrors) return Promise.reject(this);
        }
        return (this);
    }
    public async _query(opts:mysql.QueryOptions,overwriteResult:boolean = true):Promise<Query> {
        //Raw query. Don't call directly. Call exec().
        //MUST BE FORMATTED WITH ? AND A RAW ARRAY IF USING VALUES. CANNOT INTERPRET A KEYED OBJECT. NOT PREPARED, NOT NULL-SAFE.
        let qry:Query = await this._act('query',opts,overwriteResult);
        return (qry);
    }
    public async prepare(opts:StatementOpts):Promise<Statement> {
        //opts.values must be ignored by prepare. They may be sent into exec but they can't be passed to the internal prepare _query.
        let _opts:StatementOpts = Object.assign({}, opts);
        _opts.values = null;
        
        let prepID:number|string = _opts.uuid ? uuidv4().replace(/-/g,'') : NameFactory.NUM;
        let sql:string = _opts.sql;
    
        let keys:Binding[]; //leave statement keys undefined if passing an array of values for ? ...define only if rewriting the query.
        let bindingRes:{newSql:string,bindings:Binding[]} = BindParser.InlineBindings(sql);
        if (bindingRes.bindings.length) {
            sql = bindingRes.newSql;
            keys = bindingRes.bindings;
            if (!_opts.emulate) {
                for (let b of bindingRes.bindings) {
                    if (b.field) 
                        this.err = {message:`ERROR PREPARING STATEMENT. Could not bind ::${b.name}. Table and field bindings can only be used under emulation.`};
                }
                if (this.err) {
                    let stm:Statement = new Statement(this,_opts);
                    stm.err = this.err;
                    if (this.rejectErrors) return Promise.reject(stm);
                    return (stm);
                }
            }
        }
        
        sql = sql.replace(/(\w+|\?\?)(\s+)?(=)(\s+)?(\?)/g,'$1<$3>$5'); //convert all `field`=? to the null-safe <=>
        sql = sql.replace(/([\w|`|\.|\?\?]+)(\s+)?(!=)(\s+)?(\?)/g,'!($1<=>$5)'); //null-safe inequality, e.g. !(field<=>?), !(`a`.`field`<=>?), !(??<=>?)
        if (_opts.emulate) {
            _opts.sql = sql;
            let s:Statement = new Statement(this,_opts);
            if (this.logQueries) console.log('Prepared (emulated):',sql);
            s.keys = keys;
            return (s);
        }
        //escape single quotes within the query. Necessary because PREPARE x FROM 'query' surrounds the sent query with single quotes.
        sql = sql.replace(/'/g,`\\'`);
        let _s:string = `PREPARE stm_${prepID} FROM '${sql}';`
        if (this.logQueries) console.log(_s);

        _opts.sql = _s;
        let nx:Query = await this._query(_opts,false).catch((n)=>n); //don't overwrite the connection _lastResult or _lastFields with the results of PREPARE queries.
        nx.result = null; //PREPARE somehow returns an OKPacket even if there's an error. Better to have a null result if it fails.

        let stm:Statement = new Statement(this,_opts);
        Object.assign(stm,nx);
        stm.prepID = prepID;
        stm.keys = keys;

        if (stm.err && this.rejectErrors) return Promise.reject(stm);
        return (stm);
    }
    public async exec(opts:StatementOpts):Promise<Query> {
        //Single query on a prepared statement. Deallocates the statement afterwards.
        let stm:Statement = await this.prepare(opts).catch((e:Statement)=>{ return (e); });
        if (stm.err) {
            if (this.rejectErrors) return Promise.reject(stm);
            return (stm);
        }
        let qry:Query = await stm.execute(opts.values).catch((e:Statement)=>{ return (e); });
        if (!qry.result || qry.err) {
            if (this.rejectErrors) return Promise.reject(qry);
            return (qry);
        }
        if (!opts.emulate) await stm.deallocate();
        return (qry);
    }
    public async beginTransaction(opts?:mysql.QueryOptions):Promise<Query> {
        let qry:Query = await this._act('beginTransaction',opts);
        return (qry);
    }
    public async rollback(opts?:mysql.QueryOptions):Promise<Query> {
        let qry:Query = await this._act('rollback',opts);
        return (qry);
    }
    public async commit(opts?:mysql.QueryOptions):Promise<Query> {
        let qry:Query = await this._act('commit',opts);
        return (qry);
    }
    public get lastInsertID():number {
        return (this._lastResult ? this._lastResult.insertId : null);
    }
    public async release():Promise<void> {
        if (this.conn) await this.conn.release();
        this.conn = null;
    }
}