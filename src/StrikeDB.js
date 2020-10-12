var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
    const mysql = require("mysql");
    const util = require("util");
    const uuid_1 = require("uuid");
    const BindParser_1 = require("./BindParser");
    class NameFactory {
        static get NUM() {
            this._NUM = (this._NUM + 1) % 1000;
            return (this._NUM);
        }
    }
    NameFactory._NUM = 0;
    class Util {
        static GetInHelper(name, vals) {
            let sql = "";
            let keyvals = {};
            for (let k = 0; k < vals.length; k++) {
                sql += (k > 0 ? `,` : ``) + `:${name}${k}`;
                keyvals[`${name}${k}`] = vals[k];
            }
            return { sql: sql, keyvals: keyvals };
        }
    }
    exports.Util = Util;
    class Pool {
        constructor(config, opts) {
            this._connOpts = { rejectErrors: true, logQueries: true, sessionTimezone: false };
            this._persistentStatements = [];
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
        getConnection(connOpts, enqueueTimeout = 10000) {
            return __awaiter(this, void 0, void 0, function* () {
                let _connOpts = this._optsToDefault(connOpts);
                let connPromise = util.promisify(this._pool.getConnection).bind(this._pool);
                let dbc = yield new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                    if (enqueueTimeout > 0)
                        setTimeout(() => { if (!dbc)
                            reject(); }, enqueueTimeout);
                    let dbc = yield connPromise().then((c) => { return new Connection(_connOpts, c, null); })
                        .catch((e) => { return new Connection(_connOpts, null, e); });
                    resolve(dbc);
                })).catch(() => null);
                if (_connOpts.sessionTimezone)
                    yield dbc._query({ sql: `SET SESSION time_zone='${_connOpts.sessionTimezone}';` });
                return (dbc);
            });
        }
        _getPSByHandle(handle) {
            return (this._persistentStatements.find((p) => p.handle == handle));
        }
        hasPersistent(handle) {
            return (this._getPSByHandle(handle) ? true : false);
        }
        preparePersistent(handle, opts) {
            return __awaiter(this, void 0, void 0, function* () {
                let _okStatement = this._persistentStatements.find((p) => p.conn.conn && !p.conn.err);
                let conn = _okStatement ? _okStatement.conn : yield this.getConnection();
                if (!conn || conn.err)
                    return (false);
                let existing = this._getPSByHandle(handle);
                if (existing)
                    this._persistentStatements.splice(this._persistentStatements.indexOf(existing), 1);
                opts.uuid = true;
                let origOpts = Object.assign({}, opts);
                let stm = yield conn.prepare(opts);
                this._persistentStatements.push({ handle: handle, conn: conn, stm: stm, origOpts: origOpts });
                return (true);
            });
        }
        executePersistent(handle, values) {
            return __awaiter(this, void 0, void 0, function* () {
                let ps = this._getPSByHandle(handle);
                if (!ps)
                    throw new Error(`Cannot execute statement '${handle}' - statement was not found.`);
                let qry = yield ps.stm.execute(values).catch((s) => s);
                if (ps.conn.err) {
                    yield ps.conn.release();
                    for (let f of this._persistentStatements) {
                        console.log(f.handle, f.conn.conn ? f.conn.conn.threadId : 'none');
                    }
                    let ok = yield this.preparePersistent(handle, ps.origOpts);
                    if (ok) {
                        ps = this._getPSByHandle(handle);
                        qry = yield ps.stm.execute(values).catch((s) => s);
                    }
                    else {
                        ps.stm.err = { message: 'Could not get a database connection.' };
                        qry = ps.stm;
                    }
                }
                if (qry.err && this._connOpts.rejectErrors)
                    return Promise.reject(qry);
                return (qry);
            });
        }
        deallocatePersistent(handle) {
            return __awaiter(this, void 0, void 0, function* () {
                let ps = this._getPSByHandle(handle);
                if (!ps)
                    return;
                this._persistentStatements.splice(this._persistentStatements.indexOf(ps), 1);
                try {
                    yield ps.stm.deallocate();
                }
                catch (e) { }
                if (!this._persistentStatements.filter((p) => p.conn == ps.conn).length)
                    yield ps.conn.release();
            });
        }
        exec(statementOpts, connOpts) {
            return __awaiter(this, void 0, void 0, function* () {
                let conn = yield this.getConnection(connOpts, 1000).catch((e) => null);
                if (!conn) {
                    let q = new Query(conn, statementOpts);
                    q.err = { message: 'Could not get a database connection' };
                    if ((connOpts && connOpts.rejectErrors) || (!connOpts && this._connOpts.rejectErrors))
                        return Promise.reject(q);
                    return (q);
                }
                let q = yield conn.exec(statementOpts).catch((_q) => _q);
                conn.release();
                if (q.err && conn.opts.rejectErrors)
                    return (Promise.reject(q));
                return (q);
            });
        }
    }
    exports.Pool = Pool;
    class Query {
        constructor(_dbc, _opts) {
            this._dbc = _dbc;
            this._opts = _opts;
        }
    }
    exports.Query = Query;
    class Statement extends Query {
        constructor(_dbc, _execOpts) {
            super(_dbc, _execOpts);
            this._dbc = _dbc;
            this._execOpts = _execOpts;
            this.prepID = null;
            this.keys = null;
            this.useID = 0;
        }
        execute(values) {
            return __awaiter(this, void 0, void 0, function* () {
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
                        if (values[k.name] === undefined) {
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
                if (this._execOpts.emulate)
                    return (this._emulatedExecute({ sql: this._execOpts.sql, values: v, timeout: timeout, nestTables: nestTables, typeCast: typeCast }));
                if (this.prepID === null && !this.err) {
                    this.err = this._dbc.err = { message: `Attempted to execute an unprepared statement. Non-emulated statements returned as new from previously executed ones may not themselves be executed again. This is to prevent a thread race for same-name parameters. You should re-execute the original statement.` };
                    if (this._dbc.rejectErrors)
                        return Promise.reject(this);
                    return (this);
                }
                let vars = yield this._use(v);
                if (this._dbc.err) {
                    this.err = this._dbc.err;
                    if (this._dbc.rejectErrors)
                        return Promise.reject(this);
                    return (this);
                }
                let varstr = '';
                if (vars.length)
                    varstr = "USING " + vars.join(',');
                let _s = `EXECUTE stm_${this.prepID} ${varstr};`;
                if (this._dbc.logQueries)
                    console.log(_s);
                let qry = yield this._dbc._query({ sql: _s, timeout: timeout, nestTables: nestTables, typeCast: typeCast }).catch((e) => { return (e); });
                this.err = qry.err;
                this.result = qry.result;
                this.fields = qry.fields;
                if (vars.length) {
                    let p = [];
                    for (let u of vars)
                        p.push(this._dbc._act('query', { sql: `SET ${u}=NULL;` }));
                    let s = yield Promise.all(p).catch((e) => {
                        this._dbc.err = e.err;
                        return ([e]);
                    });
                }
                if (qry.err && this._dbc.rejectErrors)
                    return Promise.reject(qry);
                return (qry);
            });
        }
        _emulatedExecute(opts) {
            return __awaiter(this, void 0, void 0, function* () {
                let qry;
                if (this._dbc.rejectErrors)
                    qry = yield this._dbc._act('query', opts).catch((s) => s);
                else
                    qry = yield this._dbc._act('query', opts);
                if (this._dbc.logQueries)
                    console.log('Executed (emulated):', opts.sql, 'with', opts.values);
                this.err = qry.err;
                this.result = qry.result;
                this.fields = qry.fields;
                if (qry.err) {
                    this._dbc.err = qry.err;
                    if (this._dbc.rejectErrors)
                        return Promise.reject(qry);
                }
                return (qry);
            });
        }
        _use(values) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!values || !values.length)
                    return ([]);
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
                    p.push(this._dbc._act('query', { sql: _s }, true, true));
                    vars.push(`@${this.prepID}_${k}_${this.useID}`);
                }
                yield Promise.all(p).catch((e) => { this._dbc.err = e.err; });
                return (vars);
            });
        }
        deallocate() {
            return __awaiter(this, void 0, void 0, function* () {
                if (this._execOpts.emulate)
                    return (this);
                yield this._dbc._act('query', { sql: `DEALLOCATE PREPARE stm_${this.prepID}` }, false, true).catch((e) => this._dbc.release());
                return (this);
            });
        }
    }
    exports.Statement = Statement;
    class Connection {
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
        _act(func, opts, overwriteResult = true, forceRejectErrors) {
            return __awaiter(this, void 0, void 0, function* () {
                let qry = new Query(this, opts);
                if (!this.conn || (this.err && this.err.fatal)) {
                    qry.err = this.err;
                    if (this.rejectErrors || forceRejectErrors)
                        return Promise.reject(qry);
                    return (qry);
                }
                let q = new Promise((resolve) => {
                    this.conn[func].bind(this.conn)(opts, (err, result, fields) => {
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
                yield q;
                if (qry.err) {
                    this.err = qry.err;
                    if (this.rejectErrors || forceRejectErrors)
                        return Promise.reject(qry);
                }
                return (qry);
            });
        }
        changeUser(opts) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!this.conn || (this.err && this.err.fatal)) {
                    if (this.rejectErrors)
                        return Promise.reject(this);
                    return (this);
                }
                let c = yield util.promisify(this.conn.changeUser).bind(this.conn)(opts).catch((e) => { this.err = e; });
                if (!c) {
                    this.release();
                    if (this.rejectErrors)
                        return Promise.reject(this);
                }
                return (this);
            });
        }
        _query(opts, overwriteResult = true) {
            return __awaiter(this, void 0, void 0, function* () {
                let qry = yield this._act('query', opts, overwriteResult);
                return (qry);
            });
        }
        prepare(opts) {
            return __awaiter(this, void 0, void 0, function* () {
                let _opts = Object.assign({}, opts);
                _opts.values = null;
                let prepID = _opts.uuid ? uuid_1.v4().replace(/-/g, '') : NameFactory.NUM;
                let sql = _opts.sql;
                let keys;
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
                if (_opts.emulate) {
                    _opts.sql = sql;
                    let s = new Statement(this, _opts);
                    if (this.logQueries)
                        console.log('Prepared (emulated):', sql);
                    s.keys = keys;
                    return (s);
                }
                let _s = `PREPARE stm_${prepID} FROM ${mysql.escape(sql)};`;
                if (this.logQueries)
                    console.log(_s);
                _opts.sql = _s;
                let nx = yield this._query(_opts, false).catch((n) => n);
                nx.result = null;
                let stm = new Statement(this, _opts);
                Object.assign(stm, nx);
                stm.prepID = prepID;
                stm.keys = keys;
                if (stm.err && this.rejectErrors)
                    return Promise.reject(stm);
                return (stm);
            });
        }
        exec(opts) {
            return __awaiter(this, void 0, void 0, function* () {
                let stm = yield this.prepare(opts).catch((e) => { return (e); });
                if (stm.err) {
                    if (this.rejectErrors)
                        return Promise.reject(stm);
                    return (stm);
                }
                let qry = yield stm.execute(opts.values).catch((e) => { return (e); });
                if (!qry.result || qry.err) {
                    if (this.rejectErrors)
                        return Promise.reject(qry);
                    return (qry);
                }
                if (!opts.emulate)
                    yield stm.deallocate();
                return (qry);
            });
        }
        beginTransaction(opts) {
            return __awaiter(this, void 0, void 0, function* () {
                let qry = yield this._act('beginTransaction', opts);
                return (qry);
            });
        }
        rollback(opts) {
            return __awaiter(this, void 0, void 0, function* () {
                let qry = yield this._act('rollback', opts);
                return (qry);
            });
        }
        commit(opts) {
            return __awaiter(this, void 0, void 0, function* () {
                let qry = yield this._act('commit', opts);
                return (qry);
            });
        }
        get lastInsertID() {
            return (this._lastResult ? this._lastResult.insertId : null);
        }
        release() {
            return __awaiter(this, void 0, void 0, function* () {
                if (this.conn)
                    yield this.conn.release();
                this.conn = null;
            });
        }
    }
    exports.Connection = Connection;
});
