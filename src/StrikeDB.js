var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
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
    var mysql = require("mysql");
    var util = require("util");
    var uuid_1 = require("uuid");
    var BindParser_1 = require("./BindParser");
    var NameFactory = (function () {
        function NameFactory() {
        }
        Object.defineProperty(NameFactory, "NUM", {
            get: function () {
                this._NUM = (this._NUM + 1) % 1000;
                return (this._NUM);
            },
            enumerable: true,
            configurable: true
        });
        //numbering of statement names. This range must be wide enough to 
        NameFactory._NUM = 0;
        return NameFactory;
    }());
    var Util = (function () {
        function Util() {
        }
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
        Util.GetInHelper = function (name, vals) {
            var sql = "";
            var keyvals = {};
            for (var k = 0; k < vals.length; k++) {
                sql += (k > 0 ? "," : "") + (":" + name + k);
                keyvals["" + name + k] = vals[k];
            }
            return { sql: sql, keyvals: keyvals };
        };
        return Util;
    }());
    exports.Util = Util;
    var Pool = (function () {
        function Pool(config, opts) {
            this._connOpts = { rejectErrors: true, logQueries: true, sessionTimezone: false };
            this._persistentStatements = [];
            if (opts) {
                for (var k in opts)
                    this._connOpts[k] = opts[k];
            }
            this._pool = mysql.createPool(config);
        }
        Pool.prototype._optsToDefault = function (o) {
            if (!o)
                o = this._connOpts;
            for (var k in this._connOpts) {
                if (o[k] === undefined)
                    o[k] = this._connOpts[k];
            }
            return (o);
        };
        Pool.prototype.getConnection = function (connOpts, enqueueTimeout) {
            if (enqueueTimeout === void 0) { enqueueTimeout = 10000; }
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                var _connOpts, connPromise, dbc;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _connOpts = this._optsToDefault(connOpts);
                            connPromise = util.promisify(this._pool.getConnection).bind(this._pool);
                            return [4 /*yield*/, new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
                                    var dbc;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                if (enqueueTimeout > 0)
                                                    setTimeout(function () { if (!dbc)
                                                        reject(); }, enqueueTimeout);
                                                return [4 /*yield*/, connPromise().then(function (c) { return new Connection(_connOpts, c, null); })
                                                        .catch(function (e) { return new Connection(_connOpts, null, e); })];
                                            case 1:
                                                dbc = _a.sent();
                                                resolve(dbc);
                                                return [2 /*return*/];
                                        }
                                    });
                                }); }).catch(function () { return null; })];
                        case 1:
                            dbc = _a.sent();
                            if (!_connOpts.sessionTimezone) return [3 /*break*/, 3];
                            return [4 /*yield*/, dbc._query({ sql: "SET SESSION time_zone='" + _connOpts.sessionTimezone + "';" })];
                        case 2:
                            _a.sent();
                            _a.label = 3;
                        case 3: return [2 /*return*/, (dbc)];
                    }
                });
            });
        };
        Pool.prototype._getPSByHandle = function (handle) {
            return (this._persistentStatements.find(function (p) { return p.handle == handle; }));
        };
        Pool.prototype.hasPersistent = function (handle) {
            return (this._getPSByHandle(handle) ? true : false);
        };
        Pool.prototype.preparePersistent = function (handle, opts) {
            return __awaiter(this, void 0, void 0, function () {
                var _okStatement, conn, _a, existing, origOpts, stm;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _okStatement = this._persistentStatements.find(function (p) { return p.conn.conn && !p.conn.err; });
                            if (!_okStatement) return [3 /*break*/, 1];
                            _a = _okStatement.conn;
                            return [3 /*break*/, 3];
                        case 1: return [4 /*yield*/, this.getConnection()];
                        case 2:
                            _a = _b.sent();
                            _b.label = 3;
                        case 3:
                            conn = _a;
                            if (!conn || conn.err)
                                return [2 /*return*/, (false)];
                            existing = this._getPSByHandle(handle);
                            if (existing)
                                this._persistentStatements.splice(this._persistentStatements.indexOf(existing), 1);
                            opts.uuid = true;
                            origOpts = Object.assign({}, opts);
                            return [4 /*yield*/, conn.prepare(opts)];
                        case 4:
                            stm = _b.sent();
                            this._persistentStatements.push({ handle: handle, conn: conn, stm: stm, origOpts: origOpts });
                            return [2 /*return*/, (true)];
                    }
                });
            });
        };
        Pool.prototype.executePersistent = function (handle, values) {
            return __awaiter(this, void 0, void 0, function () {
                var ps, qry, _i, _a, f, ok;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            ps = this._getPSByHandle(handle);
                            if (!ps)
                                throw new Error("Cannot execute statement '" + handle + "' - statement was not found.");
                            return [4 /*yield*/, ps.stm.execute(values).catch(function (s) { return s; })];
                        case 1:
                            qry = _b.sent();
                            if (!ps.conn.err) return [3 /*break*/, 6];
                            return [4 /*yield*/, ps.conn.release()];
                        case 2:
                            _b.sent();
                            for (_i = 0, _a = this._persistentStatements; _i < _a.length; _i++) {
                                f = _a[_i];
                                console.log(f.handle, f.conn.conn ? f.conn.conn.threadId : 'none');
                            }
                            return [4 /*yield*/, this.preparePersistent(handle, ps.origOpts)];
                        case 3:
                            ok = _b.sent();
                            if (!ok) return [3 /*break*/, 5];
                            //The old ps has been replaced on a successful connection. Reference the new one for execution and return.
                            ps = this._getPSByHandle(handle);
                            return [4 /*yield*/, ps.stm.execute(values).catch(function (s) { return s; })];
                        case 4:
                            qry = _b.sent();
                            return [3 /*break*/, 6];
                        case 5:
                            //The old ps has not been replaced; no connection could be made.
                            ps.stm.err = { message: 'Could not get a connection.' };
                            qry = ps.stm;
                            _b.label = 6;
                        case 6:
                            if (qry.err && this._connOpts.rejectErrors)
                                return [2 /*return*/, Promise.reject(qry)];
                            return [2 /*return*/, (qry)];
                    }
                });
            });
        };
        Pool.prototype.deallocatePersistent = function (handle) {
            return __awaiter(this, void 0, void 0, function () {
                var ps, e_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            ps = this._getPSByHandle(handle);
                            if (!ps)
                                return [2 /*return*/];
                            this._persistentStatements.splice(this._persistentStatements.indexOf(ps), 1);
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, ps.stm.deallocate()];
                        case 2:
                            _a.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            e_1 = _a.sent();
                            return [3 /*break*/, 4];
                        case 4:
                            if (!!this._persistentStatements.filter(function (p) { return p.conn == ps.conn; }).length) return [3 /*break*/, 6];
                            return [4 /*yield*/, ps.conn.release()];
                        case 5:
                            _a.sent();
                            _a.label = 6;
                        case 6: return [2 /*return*/];
                    }
                });
            });
        };
        Pool.prototype.exec = function (statementOpts, connOpts) {
            return __awaiter(this, void 0, void 0, function () {
                var conn, q_1, q;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.getConnection(connOpts, 1000)];
                        case 1:
                            conn = _a.sent();
                            if (!conn) {
                                q_1 = new Query(conn, statementOpts);
                                q_1.err = { message: 'Could not get a connection' };
                                if ((connOpts && connOpts.rejectErrors) || (!connOpts && this._connOpts.rejectErrors))
                                    return [2 /*return*/, Promise.reject(q_1)];
                                return [2 /*return*/, (q_1)];
                            }
                            return [4 /*yield*/, conn.exec(statementOpts).catch(function (_q) { return _q; })];
                        case 2:
                            q = _a.sent();
                            conn.release();
                            if (q.err && conn.opts.rejectErrors)
                                return [2 /*return*/, (Promise.reject(q))];
                            return [2 /*return*/, (q)];
                    }
                });
            });
        };
        return Pool;
    }());
    exports.Pool = Pool;
    var Query = (function () {
        function Query(_dbc, _opts) {
            this._dbc = _dbc;
            this._opts = _opts;
        }
        return Query;
    }());
    exports.Query = Query;
    var Statement = (function (_super) {
        __extends(Statement, _super);
        function Statement(_dbc, _execOpts) {
            var _this = _super.call(this, _dbc, _execOpts) || this;
            _this._dbc = _dbc;
            _this._execOpts = _execOpts;
            _this.prepID = null; //set from Connection.prepare();
            _this.keys = null; //set from Connection.prepare();
            _this.useID = 0;
            return _this;
        }
        Statement.prototype.execute = function (values) {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                var timeout, nestTables, typeCast, v, bindError, vars, varstr, _s, qry, p, _i, vars_1, u, s;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (this._execOpts) {
                                timeout = this._execOpts.timeout;
                                nestTables = this._execOpts.nestTables;
                                typeCast = this._execOpts.typeCast;
                            }
                            v = [];
                            if (!this.keys) {
                                v = values;
                            }
                            else if (values) {
                                v = this.keys.reduce(function (r, k) {
                                    //kinda like !isset()
                                    if (values[k.name] === undefined) {
                                        _this.err = { message: "EXECUTION ERROR: Bound variable `" + k.name + "` is undefined" };
                                    }
                                    r.push(values[k.name]);
                                    return (r);
                                }, []);
                                if (this.err) {
                                    this._dbc.err = this.err;
                                    if (this._dbc.rejectErrors)
                                        return [2 /*return*/, Promise.reject(this)];
                                    return [2 /*return*/, (this)];
                                }
                            }
                            //convert to a standard query.
                            if (this._execOpts.emulate)
                                return [2 /*return*/, (this._emulatedExecute({ sql: this._execOpts.sql, values: v, timeout: timeout, nestTables: nestTables, typeCast: typeCast }))];
                            if (this.prepID === null && !this.err) {
                                this.err = this._dbc.err = { message: "Attempted to execute an unprepared statement. Non-emulated statements returned as new from previously executed ones may not themselves be executed again. This is to prevent a thread race for same-name parameters. You should re-execute the original statement." };
                                if (this._dbc.rejectErrors)
                                    return [2 /*return*/, Promise.reject(this)];
                                return [2 /*return*/, (this)];
                            }
                            return [4 /*yield*/, this._use(v)];
                        case 1:
                            vars = _a.sent();
                            if (this._dbc.err) {
                                this.err = this._dbc.err;
                                if (this._dbc.rejectErrors)
                                    return [2 /*return*/, Promise.reject(this)]; //exec error in this part returns the initial setup statement. Error is on the connection.
                                return [2 /*return*/, (this)];
                            }
                            varstr = '';
                            if (vars.length)
                                varstr = "USING " + vars.join(',');
                            _s = "EXECUTE stm_" + this.prepID + " " + varstr + ";";
                            if (this._dbc.logQueries)
                                console.log(_s);
                            return [4 /*yield*/, this._dbc._query({ sql: _s, timeout: timeout, nestTables: nestTables, typeCast: typeCast }).catch(function (e) { return (e); })];
                        case 2:
                            qry = _a.sent();
                            this.err = qry.err;
                            this.result = qry.result;
                            this.fields = qry.fields;
                            if (!vars.length) return [3 /*break*/, 4];
                            p = [];
                            for (_i = 0, vars_1 = vars; _i < vars_1.length; _i++) {
                                u = vars_1[_i];
                                p.push(this._dbc._act('query', { sql: "SET " + u + "=NULL;" }));
                            }
                            return [4 /*yield*/, Promise.all(p).catch(function (e) {
                                    _this._dbc.err = e.err;
                                    return ([e]);
                                })];
                        case 3:
                            s = _a.sent();
                            _a.label = 4;
                        case 4:
                            if (qry.err && this._dbc.rejectErrors)
                                return [2 /*return*/, Promise.reject(qry)];
                            return [2 /*return*/, (qry)];
                    }
                });
            });
        };
        /**
         * Alternate shunt for executing w/o actually setting up a server prepared statement.
         * @param values
         */
        Statement.prototype._emulatedExecute = function (opts) {
            return __awaiter(this, void 0, void 0, function () {
                var qry;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!this._dbc.rejectErrors) return [3 /*break*/, 2];
                            return [4 /*yield*/, this._dbc._act('query', opts).catch(function (s) { return s; })];
                        case 1:
                            qry = _a.sent(); //must handle internally
                            return [3 /*break*/, 4];
                        case 2: return [4 /*yield*/, this._dbc._act('query', opts)];
                        case 3:
                            qry = _a.sent();
                            _a.label = 4;
                        case 4:
                            if (this._dbc.logQueries)
                                console.log('Executed (emulated):', opts.sql, 'with', opts.values);
                            //copy the newly generated stm values to this.
                            this.err = qry.err;
                            this.result = qry.result;
                            this.fields = qry.fields;
                            if (qry.err) {
                                this._dbc.err = qry.err;
                                if (this._dbc.rejectErrors)
                                    return [2 /*return*/, Promise.reject(qry)];
                            }
                            return [2 /*return*/, (qry)];
                    }
                });
            });
        };
        /**
         * Sets up the user-allocated vars for the execution and returns a string to put into EXECUTE with those sql vars.
         * @param values
         */
        Statement.prototype._use = function (values) {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                var vars, p, unsetters, k, _val, _key, _s;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!values || !values.length)
                                return [2 /*return*/, ([])];
                            //increment the statement's useID prior to every execution to preserve variables held for other executions.
                            //this allows you to asynchronously call execute with different parameters on the same prepared statement at the same time, and await Promise.all(). 
                            //Be sure to set returnNew==true in execute() if you want to use this behavior. Otherwise you'll only get the last statement on the connection.
                            this.useID++;
                            vars = [];
                            p = [];
                            unsetters = [];
                            for (k = 0; k < values.length; k++) {
                                _val = values[k] === null ? 'NULL' : "'" + values[k] + "'";
                                _key = "@" + this.prepID + "_" + k + "_" + this.useID;
                                _s = "SET " + _key + "=" + _val + ";";
                                unsetters.push(_key);
                                if (this._dbc.logQueries)
                                    console.log(_s);
                                p.push(this._dbc._act('query', { sql: _s }, true, true)); //SET @a_${useID}=1
                                vars.push("@" + this.prepID + "_" + k + "_" + this.useID); //USING @a, @b... returned to the execution statement.
                            }
                            //catch this part internally when setting up a prepared statement; return the connection with the actual errr...
                            return [4 /*yield*/, Promise.all(p).catch(function (e) { _this._dbc.err = e.err; })];
                        case 1:
                            //catch this part internally when setting up a prepared statement; return the connection with the actual errr...
                            _a.sent();
                            return [2 /*return*/, (vars)];
                    }
                });
            });
        };
        Statement.prototype.deallocate = function () {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            //Deallocation is crucial when using pooled connections.
                            if (this._execOpts.emulate)
                                return [2 /*return*/, (this)];
                            return [4 /*yield*/, this._dbc._act('query', { sql: "DEALLOCATE PREPARE stm_" + this.prepID }, false, true).catch(function (e) { return _this._dbc.release(); })];
                        case 1:
                            _a.sent();
                            return [2 /*return*/, (this)];
                    }
                });
            });
        };
        return Statement;
    }(Query));
    exports.Statement = Statement;
    var Connection = (function () {
        function Connection(opts, conn, err) {
            this.opts = opts;
            this.conn = conn;
            this.err = err;
        }
        Object.defineProperty(Connection.prototype, "rejectErrors", {
            get: function () {
                return (this.opts.rejectErrors);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Connection.prototype, "logQueries", {
            get: function () {
                return (this.opts.logQueries);
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Internal call for acting on the connection. Rewrites the func:string to a call on the conn and returns / rejects with a Statement.
         * The statement is never prepared or executed, it is just assembled here from the options and the call's result.
         * @param func
         * @param opts
         * @param overwriteResult
         * @param forceRejectErrors
         */
        Connection.prototype._act = function (func, opts, overwriteResult, forceRejectErrors) {
            if (overwriteResult === void 0) { overwriteResult = true; }
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                var qry, q;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            qry = new Query(this, opts);
                            if (!this.conn || (this.err && this.err.fatal)) {
                                qry.err = this.err;
                                if (this.rejectErrors || forceRejectErrors)
                                    return [2 /*return*/, Promise.reject(qry)];
                                return [2 /*return*/, (qry)];
                            }
                            q = new Promise(function (resolve) {
                                _this.conn[func].bind(_this.conn)(opts, function (err, result, fields) {
                                    if (err) {
                                        qry.err = err;
                                        return resolve();
                                    }
                                    if (overwriteResult) {
                                        _this._lastResult = result;
                                        _this._lastFields = fields;
                                    }
                                    qry.result = result;
                                    qry.fields = fields;
                                    return resolve();
                                });
                            });
                            return [4 /*yield*/, q];
                        case 1:
                            _a.sent();
                            //if there's an error, either reject or return this object with the error.
                            if (qry.err) {
                                this.err = qry.err;
                                if (this.rejectErrors || forceRejectErrors)
                                    return [2 /*return*/, Promise.reject(qry)];
                            }
                            return [2 /*return*/, (qry)];
                    }
                });
            });
        };
        Connection.prototype.changeUser = function (opts) {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                var c;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!this.conn || (this.err && this.err.fatal)) {
                                if (this.rejectErrors)
                                    return [2 /*return*/, Promise.reject(this)];
                                return [2 /*return*/, (this)];
                            }
                            return [4 /*yield*/, util.promisify(this.conn.changeUser).bind(this.conn)(opts).catch(function (e) { _this.err = e; })];
                        case 1:
                            c = _a.sent();
                            if (!c) {
                                this.release();
                                if (this.rejectErrors)
                                    return [2 /*return*/, Promise.reject(this)];
                            }
                            return [2 /*return*/, (this)];
                    }
                });
            });
        };
        Connection.prototype._query = function (opts, overwriteResult) {
            if (overwriteResult === void 0) { overwriteResult = true; }
            return __awaiter(this, void 0, void 0, function () {
                var qry;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this._act('query', opts, overwriteResult)];
                        case 1:
                            qry = _a.sent();
                            return [2 /*return*/, (qry)];
                    }
                });
            });
        };
        Connection.prototype.prepare = function (opts) {
            return __awaiter(this, void 0, void 0, function () {
                var prepID, sql, keys, bindingRes, _i, _a, b, stm_1, s, _s, nx, stm;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            prepID = opts.uuid ? uuid_1.v4().replace(/-/g, '') : NameFactory.NUM;
                            sql = opts.sql;
                            bindingRes = BindParser_1.BindParser.InlineBindings(sql);
                            if (bindingRes.bindings.length) {
                                sql = bindingRes.newSql;
                                keys = bindingRes.bindings;
                                if (!opts.emulate) {
                                    for (_i = 0, _a = bindingRes.bindings; _i < _a.length; _i++) {
                                        b = _a[_i];
                                        if (b.field)
                                            this.err = { message: "ERROR PREPARING STATEMENT. Could not bind ::" + b.name + ". Table and field bindings can only be used under emulation." };
                                    }
                                    if (this.err) {
                                        stm_1 = new Statement(this, opts);
                                        stm_1.err = this.err;
                                        if (this.rejectErrors)
                                            return [2 /*return*/, Promise.reject(stm_1)];
                                        return [2 /*return*/, (stm_1)];
                                    }
                                }
                            }
                            sql = sql.replace(/(\w+|\?\?)(\s+)?(=)(\s+)?(\?)/g, '$1<$3>$5'); //convert all `field`=? to the null-safe <=>
                            sql = sql.replace(/([\w|`|\.|\?\?]+)(\s+)?(!=)(\s+)?(\?)/g, '!($1<=>$5)'); //null-safe inequality, e.g. !(field<=>?), !(`a`.`field`<=>?), !(??<=>?)
                            if (opts.emulate) {
                                opts.sql = sql;
                                s = new Statement(this, opts);
                                if (this.logQueries)
                                    console.log('Prepared (emulated):', sql);
                                s.keys = keys;
                                return [2 /*return*/, (s)];
                            }
                            //escape single quotes within the query. Necessary because PREPARE x FROM 'query' surrounds the sent query with single quotes.
                            sql = sql.replace(/'/g, "\\'");
                            _s = "PREPARE stm_" + prepID + " FROM '" + sql + "';";
                            if (this.logQueries)
                                console.log(_s);
                            opts.sql = _s;
                            return [4 /*yield*/, this._query(opts, false).catch(function (n) { return n; })];
                        case 1:
                            nx = _b.sent();
                            nx.result = null; //PREPARE somehow returns an OKPacket even if there's an error. Better to have a null result if it fails.
                            stm = new Statement(this, opts);
                            Object.assign(stm, nx);
                            stm.prepID = prepID;
                            stm.keys = keys;
                            if (stm.err && this.rejectErrors)
                                return [2 /*return*/, Promise.reject(stm)];
                            return [2 /*return*/, (stm)];
                    }
                });
            });
        };
        Connection.prototype.exec = function (opts) {
            return __awaiter(this, void 0, void 0, function () {
                var stm, qry;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.prepare({ sql: opts.sql, timeout: opts.timeout, nestTables: opts.nestTables, typeCast: opts.typeCast, emulate: opts.emulate }).catch(function (e) { return (e); })];
                        case 1:
                            stm = _a.sent();
                            if (stm.err) {
                                if (this.rejectErrors)
                                    return [2 /*return*/, Promise.reject(stm)];
                                return [2 /*return*/, (stm)];
                            }
                            return [4 /*yield*/, stm.execute(opts.values).catch(function (e) { return (e); })];
                        case 2:
                            qry = _a.sent();
                            if (!qry.result || qry.err) {
                                if (this.rejectErrors)
                                    return [2 /*return*/, Promise.reject(qry)];
                                return [2 /*return*/, (qry)];
                            }
                            if (!!opts.emulate) return [3 /*break*/, 4];
                            return [4 /*yield*/, stm.deallocate()];
                        case 3:
                            _a.sent();
                            _a.label = 4;
                        case 4: return [2 /*return*/, (qry)];
                    }
                });
            });
        };
        Connection.prototype.beginTransaction = function (opts) {
            return __awaiter(this, void 0, void 0, function () {
                var qry;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this._act('beginTransaction', opts)];
                        case 1:
                            qry = _a.sent();
                            return [2 /*return*/, (qry)];
                    }
                });
            });
        };
        Connection.prototype.rollback = function (opts) {
            return __awaiter(this, void 0, void 0, function () {
                var qry;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this._act('rollback', opts)];
                        case 1:
                            qry = _a.sent();
                            return [2 /*return*/, (qry)];
                    }
                });
            });
        };
        Connection.prototype.commit = function (opts) {
            return __awaiter(this, void 0, void 0, function () {
                var qry;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this._act('commit', opts)];
                        case 1:
                            qry = _a.sent();
                            return [2 /*return*/, (qry)];
                    }
                });
            });
        };
        Object.defineProperty(Connection.prototype, "lastInsertID", {
            get: function () {
                return (this._lastResult ? this._lastResult.insertId : null);
            },
            enumerable: true,
            configurable: true
        });
        Connection.prototype.release = function () {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!this.conn) return [3 /*break*/, 2];
                            return [4 /*yield*/, this.conn.release()];
                        case 1:
                            _a.sent();
                            _a.label = 2;
                        case 2:
                            this.conn = null;
                            return [2 /*return*/];
                    }
                });
            });
        };
        return Connection;
    }());
    exports.Connection = Connection;
});
