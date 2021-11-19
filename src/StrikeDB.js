(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "mysql", "util", "uuid", "./BindParser"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Connection = exports.Statement = exports.Query = exports.Pool = exports.Util = void 0;
    const mysql = require("mysql");
    const util = require("util");
    const uuid_1 = require("uuid");
    const BindParser_1 = require("./BindParser");
    class NameFactory {
        //Numbering of prepared statement names. This range should be wide enough to accommodate the max number of normal 
        //non-persistent statements expected to be allocated at any given time.
        static _NUM = 0;
        static get NUM() {
            this._NUM = (this._NUM + 1) % 1000;
            return (this._NUM);
        }
    }
    class Util {
        /**
         * Helper for WHERE `id` IN (1,2) statements. Example:
         *
         * let idHelper:InHelper = Util.GetInHelper('id',[1,2]);
         * let stm:Statement = await conn.prepare(`SELECT * FROM ::table WHERE ::field IN (${idHelper.sql})`,{emulate:true});
         *
         * The above prepares the emulated statement: SELECT * FROM ?? WHERE ?? in (?,?);
         *
         * await stm.execute(Object.assign({table:'games',field:'homeID'},idHelper.keyvals)); //merge the helper's pairs into the bind object.
         *
         * @param name a unique name for the set.
         * @param vals
         */
        static GetInHelper(name, vals) {
            let sql = "";
            let keyvals = {};
            for (let k = 0; k < vals.length; k++) {
                sql += (k > 0 ? `,` : ``) + `:${name}${k}`;
                keyvals[`${name}${k}`] = vals[k];
            }
            return { sql: sql, keyvals: keyvals };
        }
        static CatchRejectedQuery(q) {
            console.log('CAUGHT REJECTED QUERY:\n', q.err);
            return (q);
        }
    }
    exports.Util = Util;
    class Pool {
        _pool;
        _connOpts = { rejectErrors: true, logQueries: true, timezone: false };
        _persistentStatements = [];
        constructor(config, opts) {
            if (opts) {
                for (let k in opts)
                    this._connOpts[k] = opts[k];
            }
            this._pool = mysql.createPool(config);
        }
        _optsToDefault(o) {
            if (!o)
                return (this._connOpts);
            for (let k in this._connOpts) {
                if (o[k] === undefined)
                    o[k] = this._connOpts[k];
            }
            return (o);
        }
        async getConnection(connOpts, enqueueTimeout = 10000) {
            let _connOpts = this._optsToDefault(connOpts);
            let connPromise = util.promisify(this._pool.getConnection).bind(this._pool);
            let _timeout = false;
            let dbc = await new Promise(async (resolve, reject) => {
                let _dbc;
                if (enqueueTimeout > 0) {
                    setTimeout(() => {
                        if (!_dbc) {
                            console.log('enqueueTimeout failed. NOT Rejecting.');
                            _timeout = true;
                            //Rejecting here causes the connections to pile up and never return or release.
                            //So enqueueTimeout does not guarantee the connection will be released within the given time, only that an error will be 
                            //returned and the connection will not succeed when it finally gets to the front of the queue.
                            //reject('enqueueTimeout failed. Rejecting.');
                        }
                    }, enqueueTimeout);
                }
                _dbc = await connPromise().then((c) => { return new Connection(_connOpts, c, null); })
                    .catch((e) => { return new Connection(_connOpts, null, e); });
                if (_timeout) {
                    _dbc.release();
                    _dbc.err = { message: 'Connection was cancelled due to enqueueTimeout.' }; //inject our own error 
                }
                if (!_dbc)
                    reject();
                else
                    resolve(_dbc);
            }).catch((err) => {
                console.log('Connection to server failed:', err);
                return (null);
            });
            if (_connOpts.timezone)
                await dbc._query({ sql: `SET SESSION time_zone='${_connOpts.timezone}';` });
            return (dbc);
        }
        _getPSByHandle(handle) {
            return (this._persistentStatements.find((p) => p.handle == handle));
        }
        hasPersistent(handle) {
            return (this._getPSByHandle(handle) ? true : false);
        }
        async preparePersistent(handle, opts) {
            let _okStatement = this._persistentStatements.find((p) => p.conn.conn && !p.conn.err);
            let conn = _okStatement ? _okStatement.conn : await this.getConnection();
            if (!conn || conn.err) {
                if (this._connOpts.logQueries)
                    console.log(conn);
                let q = new Query(conn, opts);
                q.err = { message: 'Could not get a database connection' };
                if (this._connOpts.rejectErrors)
                    return Promise.reject(q);
                return (false);
            }
            let existing = this._getPSByHandle(handle);
            if (existing)
                this._persistentStatements.splice(this._persistentStatements.indexOf(existing), 1);
            opts.uuid = true;
            let origOpts = Object.assign({}, opts);
            let stm = await conn.prepare(opts);
            this._persistentStatements.push({ handle: handle, conn: conn, stm: stm, origOpts: origOpts });
            return (true);
        }
        async executePersistent(handle, values) {
            let ps = this._getPSByHandle(handle);
            if (!ps)
                throw new Error(`Cannot execute statement '${handle}' - statement was not found.`);
            let qry = await ps.stm.execute(values).catch((s) => s);
            if (ps.conn.err) {
                await ps.conn.release();
                //for (let f of this._persistentStatements) { console.log(f.handle,f.conn.conn ? f.conn.conn.threadId : 'none') }
                let ok = await this.preparePersistent(handle, ps.origOpts);
                if (ok) {
                    //The old ps has been replaced on a successful connection. Reference the new one for execution and return.
                    ps = this._getPSByHandle(handle);
                    qry = await ps.stm.execute(values).catch((s) => s);
                }
                else {
                    //The old ps has not been replaced; no connection could be made.
                    ps.stm.err = { message: 'Could not get a database connection.' };
                    qry = ps.stm;
                }
            }
            if (qry.err && this._connOpts.rejectErrors)
                return Promise.reject(qry);
            return (qry);
        }
        async deallocatePersistent(handle) {
            let ps = this._getPSByHandle(handle);
            if (!ps)
                return;
            this._persistentStatements.splice(this._persistentStatements.indexOf(ps), 1);
            try {
                await ps.stm.deallocate();
            }
            catch (e) { }
            if (!this._persistentStatements.filter((p) => p.conn == ps.conn).length)
                await ps.conn.release();
        }
        async exec(statementOpts, connOpts) {
            let conn = await this.getConnection(connOpts, 1000).catch((e) => null);
            if (!conn || conn.err) {
                let q = new Query(conn, statementOpts);
                q.err = { message: 'Could not get a database connection' };
                //look at connOpts passed in, if not default to the setting for the pool.
                if ((connOpts && connOpts.rejectErrors) || (!connOpts && this._connOpts.rejectErrors))
                    return Promise.reject(q);
                return (q);
            }
            let q = await conn.exec(statementOpts).catch((_q) => _q);
            conn.release();
            if (q.err && conn.opts.rejectErrors)
                return (Promise.reject(q));
            return (q);
        }
    }
    exports.Pool = Pool;
    class Query {
        _dbc;
        _opts;
        err;
        result;
        fields;
        constructor(_dbc, _opts) {
            this._dbc = _dbc;
            this._opts = _opts;
        }
    }
    exports.Query = Query;
    class Statement extends Query {
        _dbc;
        _execOpts;
        prepID = null; //set from Connection.prepare();
        keys = null; //set from Connection.prepare();
        useID = 0;
        constructor(_dbc, _execOpts) {
            super(_dbc, _execOpts);
            this._dbc = _dbc;
            this._execOpts = _execOpts;
        }
        async execute(values) {
            let timeout, nestTables, typeCast;
            if (this._execOpts) {
                timeout = this._execOpts.timeout;
                nestTables = this._execOpts.nestTables;
                typeCast = this._execOpts.typeCast;
            }
            let v = [];
            let bindError;
            if (!this.keys) {
                v = values;
            }
            else if (values) {
                v = this.keys.reduce((r, k) => {
                    //kinda like !isset()
                    if (values[k.name] === undefined) { //don't throw if it's specified but intentionally null. The one time I've been glad there's a difference!
                        this.err = { message: `EXECUTION ERROR: Bound variable \`${k.name}\` is undefined` };
                    }
                    r.push(values[k.name]);
                    return (r);
                }, []);
                if (this.err) {
                    this._dbc.err = this.err;
                    if (this._dbc.rejectErrors)
                        return Promise.reject(this);
                    return (this);
                }
            }
            //convert to a standard query.
            if (this._execOpts.emulate)
                return (this._emulatedExecute({ sql: this._execOpts.sql, values: v, timeout: timeout, nestTables: nestTables, typeCast: typeCast }));
            if (this.prepID === null && !this.err) {
                this.err = this._dbc.err = { message: `Attempted to execute an unprepared statement. Non-emulated statements returned as new from previously executed ones may not themselves be executed again. This is to prevent a thread race for same-name parameters. You should re-execute the original statement.` };
                if (this._dbc.rejectErrors)
                    return Promise.reject(this);
                return (this);
            }
            let vars = await this._use(v);
            if (this._dbc.err) { //_dbc.err will be set by _use if there's an internal problem with any SET.
                this.err = this._dbc.err;
                if (this._dbc.rejectErrors)
                    return Promise.reject(this); //exec error in this part returns the initial setup statement. Error is on the connection.
                return (this);
            }
            //Create a new execution statement. We return the new one to replace this one.
            let varstr = '';
            if (vars.length)
                varstr = "USING " + vars.join(',');
            let _s = `EXECUTE stm_${this.prepID} ${varstr};`;
            if (this._dbc.logQueries)
                console.log(_s);
            //_query() / _act() fills in any stm.err as well as the connection's err.
            let qry = await this._dbc._query({ sql: _s, timeout: timeout, nestTables: nestTables, typeCast: typeCast }).catch((e) => { return (e); });
            this.err = qry.err;
            this.result = qry.result;
            this.fields = qry.fields;
            //clean up the session vars
            if (vars.length) {
                let p = [];
                for (let u of vars)
                    p.push(this._dbc._act('query', { sql: `SET ${u}=NULL;` }));
                let s = await Promise.all(p).catch((e) => {
                    this._dbc.err = e.err;
                    return ([e]);
                });
            }
            if (qry.err && this._dbc.rejectErrors)
                return Promise.reject(qry);
            return (qry);
        }
        /**
         * Alternate shunt for executing w/o actually setting up a server prepared statement.
         * @param values
         */
        async _emulatedExecute(opts) {
            let qry;
            if (this._dbc.rejectErrors)
                qry = await this._dbc._act('query', opts).catch((s) => s); //must handle internally
            else
                qry = await this._dbc._act('query', opts);
            if (this._dbc.logQueries)
                console.log('Executed (emulated):', opts.sql, 'with', opts.values);
            //copy the newly generated stm values to this.
            this.err = qry.err;
            this.result = qry.result;
            this.fields = qry.fields;
            if (qry.err) {
                this._dbc.err = qry.err;
                if (this._dbc.rejectErrors)
                    return Promise.reject(qry);
            }
            return (qry);
        }
        /**
         * Sets up the user-allocated vars for the execution and returns a string to put into EXECUTE with those sql vars.
         * @param values
         */
        async _use(values) {
            if (!values || !values.length)
                return ([]);
            //increment the statement's useID prior to every execution to preserve variables held for other executions.
            //this allows you to asynchronously call execute with different parameters on the same prepared statement at the same time, and await Promise.all(). 
            this.useID++;
            let vars = [];
            let p = [];
            let unsetters = [];
            for (let k = 0; k < values.length; k++) {
                let _val = values[k] === null ? null : values[k];
                let _key = `@${this.prepID}_${k}_${this.useID}`;
                let _s = `SET ${_key}=${mysql.escape(_val)};`;
                unsetters.push(_key);
                if (this._dbc.logQueries)
                    console.log(_s);
                p.push(this._dbc._act('query', { sql: _s }, true, true)); //SET @a_${useID}=1
                vars.push(`@${this.prepID}_${k}_${this.useID}`); //USING @a, @b... returned to the execution statement.
            }
            //catch this part internally when setting up a prepared statement; return the connection with the actual errr...
            await Promise.all(p).catch((e) => { this._dbc.err = e.err; });
            return (vars);
        }
        async deallocate() {
            //Deallocation is crucial when using pooled connections.
            if (this._execOpts.emulate)
                return (this);
            await this._dbc._act('query', { sql: `DEALLOCATE PREPARE stm_${this.prepID}` }, false, true).catch((e) => this._dbc.release());
            return (this);
        }
    }
    exports.Statement = Statement;
    class Connection {
        opts;
        conn;
        err;
        _lastResult;
        _lastFields;
        constructor(opts, conn, err) {
            this.opts = opts;
            this.conn = conn;
            this.err = err;
        }
        get rejectErrors() {
            return (this.opts.rejectErrors);
        }
        get logQueries() {
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
        async _act(func, opts, overwriteResult = true, forceRejectErrors) {
            //By definition, 'emulate' is irrelevant for _act statements. They are never prepared, but assembled here and run immediately raw.
            //For example, PREPARE and EXECUTE are both handled through _act().
            let qry = new Query(this, opts);
            if (!this.conn || (this.err && this.err.fatal)) {
                qry.err = this.err;
                if (this.rejectErrors || forceRejectErrors)
                    return Promise.reject(qry);
                return (qry);
            }
            //Automated promisifying strips out the fieldinfo, which we want to retain. Promisify by hand. Always resolve here. Reject later if there's an err.
            let q = new Promise((resolve) => {
                this.conn[func].bind(this.conn)(opts, (err, result, fields) => {
                    if (err) {
                        qry.err = err;
                        return resolve(null);
                    }
                    if (overwriteResult) {
                        this._lastResult = result;
                        this._lastFields = fields;
                    }
                    qry.result = result;
                    qry.fields = fields;
                    return resolve(null);
                });
            });
            await q;
            //if there's an error, either reject or return this object with the error.
            if (qry.err) {
                this.err = qry.err;
                if (this.rejectErrors || forceRejectErrors)
                    return Promise.reject(qry);
            }
            return (qry);
        }
        async changeUser(opts) {
            if (!this.conn || (this.err && this.err.fatal)) {
                if (this.rejectErrors)
                    return Promise.reject(this);
                return (this);
            }
            let c = await util.promisify(this.conn.changeUser).bind(this.conn)(opts).catch((e) => { this.err = e; });
            if (!c) {
                this.release();
                if (this.rejectErrors)
                    return Promise.reject(this);
            }
            return (this);
        }
        async _query(opts, overwriteResult = true) {
            //Raw query. Don't call directly. Call exec().
            //MUST BE FORMATTED WITH ? AND A RAW ARRAY IF USING VALUES. CANNOT INTERPRET A KEYED OBJECT. NOT PREPARED, NOT NULL-SAFE.
            let qry = await this._act('query', opts, overwriteResult);
            return (qry);
        }
        async prepare(opts) {
            //opts.values must be ignored by prepare. They may be sent into exec but they can't be passed to the internal prepare _query.
            let _opts = Object.assign({}, opts);
            _opts.values = null;
            let prepID = _opts.uuid ? (0, uuid_1.v4)().replace(/-/g, '') : NameFactory.NUM;
            let sql = _opts.sql;
            let keys; //leave statement keys undefined if passing an array of values for ? ...define only if rewriting the query.
            let bindingRes = BindParser_1.BindParser.InlineBindings(sql);
            if (bindingRes.bindings.length) {
                sql = bindingRes.newSql;
                keys = bindingRes.bindings;
                if (!_opts.emulate) {
                    for (let b of bindingRes.bindings) {
                        if (b.field)
                            this.err = { message: `ERROR PREPARING STATEMENT. Could not bind ::${b.name}. Table and field bindings can only be used under emulation.` };
                    }
                    if (this.err) {
                        let stm = new Statement(this, _opts);
                        stm.err = this.err;
                        if (this.rejectErrors)
                            return Promise.reject(stm);
                        return (stm);
                    }
                }
            }
            /* if (sql.substr(0,6).toLowerCase() != 'update') {
                sql = sql.replace(/(\w+|\?\?)(\s+)?(=)(\s+)?(\?)/g,'$1<$3>$5'); //convert all `field`=? to the null-safe <=>
                sql = sql.replace(/([\w|`|\.|\?\?]+)(\s+)?(!=)(\s+)?(\?)/g,'!($1<=>$5)'); //null-safe inequality, e.g. !(field<=>?), !(`a`.`field`<=>?), !(??<=>?)
            } */
            if (_opts.emulate) {
                _opts.sql = sql;
                let s = new Statement(this, _opts);
                if (this.logQueries)
                    console.log('Prepared (emulated):', sql);
                s.keys = keys;
                return (s);
            }
            //escape single quotes within the query. Necessary because PREPARE x FROM 'query' surrounds the sent query with single quotes.
            //sql = sql.replace(/'/g,`\\'`);
            let _s = `PREPARE stm_${prepID} FROM ${mysql.escape(sql)};`;
            if (this.logQueries)
                console.log(_s);
            _opts.sql = _s;
            let nx = await this._query(_opts, false).catch((n) => n); //don't overwrite the connection _lastResult or _lastFields with the results of PREPARE queries.
            nx.result = null; //PREPARE somehow returns an OKPacket even if there's an error. Better to have a null result if it fails.
            let stm = new Statement(this, _opts);
            Object.assign(stm, nx);
            stm.prepID = prepID;
            stm.keys = keys;
            if (stm.err && this.rejectErrors)
                return Promise.reject(stm);
            return (stm);
        }
        async exec(opts) {
            //Single query on a prepared statement. Deallocates the statement afterwards.
            let stm = await this.prepare(opts).catch((e) => { return (e); });
            if (stm.err) {
                if (this.rejectErrors)
                    return Promise.reject(stm);
                return (stm);
            }
            let qry = await stm.execute(opts.values).catch((e) => { return (e); });
            if (!qry.result || qry.err) {
                if (this.rejectErrors)
                    return Promise.reject(qry);
                return (qry);
            }
            if (!opts.emulate)
                await stm.deallocate();
            return (qry);
        }
        async beginTransaction(opts) {
            let qry = await this._act('beginTransaction', opts);
            return (qry);
        }
        async rollback(opts) {
            let qry = await this._act('rollback', opts);
            return (qry);
        }
        async commit(opts) {
            let qry = await this._act('commit', opts);
            return (qry);
        }
        get lastInsertID() {
            return (this._lastResult ? this._lastResult.insertId : null);
        }
        async release() {
            if (this.conn)
                await this.conn.release();
            this.conn = null;
        }
        async end() {
            if (this.conn)
                await this.conn.end();
            this.conn = null;
        }
        async destroy() {
            if (this.conn)
                await this.conn.destroy();
            this.conn = null;
        }
    }
    exports.Connection = Connection;
});
